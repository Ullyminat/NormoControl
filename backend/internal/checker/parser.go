package checker

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

// DocParser handles the unzip and XML parsing
type DocParser struct{}

func NewDocParser() *DocParser {
	return &DocParser{}
}

type DocStats struct {
	TablesCount   int
	ImagesCount   int
	FormulasCount int
	TotalPages    int
}

// ParsedDoc represents a simplified, flat view of the document for easier checking
type ParsedDoc struct {
	Margins    Margins
	PageSize   PageSize
	Paragraphs []ParsedParagraph
	Tables     []ParsedTable
	Images     []ParsedImage
	Formulas   []ParsedFormula
	Stats      DocStats
}

type ParsedTable struct {
	ID               string
	Alignment        string // left, right, center
	WidthType        string // auto, pct, dxa
	WidthValue       int    // value in the width unit
	HasHeaderRow     bool   // TblLook firstRow flag or explicit tblHeader on first row
	HasRowBanding    bool   // row banding (noHBand = false → banding ON)
	HasColBanding    bool   // col banding
	HasBorders       bool   // true if tblBorders has at least one non-nil border
	HasInnerBorders  bool   // true if insideH or insideV are defined
	CellSpacingMm    float64
	RowCount         int
	ColCount         int
	MinRowHeightMm   float64 // smallest explicit row height found (0 if no heights set)
	HasCaption       bool
	CaptionText      string
	CaptionNumber    string
	CaptionAbove     bool // true = caption above table, false = below
	CaptionHasDash   bool // caption contains em-dash '–' or '—' (ESKD requirement)
	CaptionIndentMm  float64
	CaptionBeforePt  float64
	CaptionAfterPt   float64
	CaptionAlignment string
}

type tableCaptionInfo struct {
	Text      string
	IndentMm  float64
	BeforePt  float64
	AfterPt   float64
	Alignment string
}

type ParsedImage struct {
	ID               string
	ParagraphID      string
	ParagraphIndex   int
	PageNumber       int
	Alignment        string
	HasCaption       bool
	CaptionText      string
	CaptionNumber    string
	CaptionBelow     bool
	CaptionHasDash   bool
	CaptionIndentMm  float64
	CaptionBeforePt  float64
	CaptionAfterPt   float64
	CaptionAlignment string
}

type ParsedFormula struct {
	ID           string
	WrapperID    string // Paragraph ID containing it
	Alignment    string // center, left, right (from paragraph jc OR oMathPara jc)
	HasNumbering bool   // paragraph text contains (N) or (N.N) after formula
}

type Margins struct {
	TopMm    float64
	BottomMm float64
	LeftMm   float64
	RightMm  float64
	HeaderMm float64
	FooterMm float64
}

type PageSize struct {
	WidthMm     float64
	HeightMm    float64
	Orientation string // portrait, landscape
}

type ParsedParagraph struct {
	Text              string
	Role              string  // body, heading, list, toc, table_caption, figure_caption, formula
	Alignment         string  // left, center, right, both
	LineSpacing       float64 // Generic multiplier (e.g. 1.5)
	FirstLineIndentMm float64
	SpacingBeforePt   float64 // w:spacing w:before in points
	SpacingAfterPt    float64 // w:spacing w:after in points

	// Typography
	FontName    string
	FontSizePt  float64
	IsBold      bool
	BoldRatio   float64
	IsItalic    bool
	IsUnderline bool
	IsAllCaps   bool

	// Structure
	ID               string // specific ID e.g. "p-1", "p-2"
	StyleID          string // e.g. "Heading1"
	IsListItem       bool   // true if numPr exists
	ListLevel        int    // ilvl
	StartsPageBreak  bool   // if explicit break is found
	HasFormula       bool   // true if paragraph contains oMath or oMathPara
	HeuristicHeading bool   // true if detected as a heading by visual/text heuristics
	HeuristicLevel   int    // estimated level: 1 = largest, 2, 3 …

	// Page Scope
	PageNumber int // Estimated page number

	// Flow
	KeepLines    bool
	KeepNext     bool
	WidowControl bool // true if on (default usually on in Word)
}

// formulaNumberingRe matches "(1)", "(1.1)", "(А.1)" etc. anywhere in the line
// ESKD formulas often have the number in the same paragraph separated by a tab stop
var formulaNumberingRe = regexp.MustCompile(`\(\s*[\dА-Яа-яA-Za-z]+[.\d]*\s*\)`)
var headingNumberingRe = regexp.MustCompile(`^\s*(\d+(?:\.\d+){0,5})\.?\s+\S+`)
var tocEntryRe = regexp.MustCompile(`^.+[\._\-\s]{2,}\d+$`)
var tableCaptionRe = regexp.MustCompile(`(?i)^\s*(таблица|табл\.|table)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*[\dа-яa-z]+`)
var figureCaptionRe = regexp.MustCompile(`(?i)^\s*(рисунок|рис\.|figure|fig\.)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*[\dа-яa-z]+`)
var tableCaptionNumberRe = regexp.MustCompile(`(?i)^\s*(?:таблица|табл\.|table)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*([0-9]+(?:[\.\-][0-9]+)*)`)
var figureCaptionNumberRe = regexp.MustCompile(`(?i)^\s*(?:рисунок|рис\.|figure|fig\.)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*([0-9]+(?:[\.\-][0-9]+)*)`)

func (p *DocParser) Parse(filePath string) (*ParsedDoc, error) {
	r, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	// 1. Find and Open word/document.xml
	var docXMLFile *zip.File
	for _, f := range r.File {
		if f.Name == "word/document.xml" {
			docXMLFile = f
			break
		}
	}
	if docXMLFile == nil {
		return nil, fmt.Errorf("invalid docx: missing word/document.xml")
	}

	rc, err := docXMLFile.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	// 2. Decode XML
	var doc Document
	bytes, _ := io.ReadAll(rc)
	if err := xml.Unmarshal(bytes, &doc); err != nil {
		return nil, fmt.Errorf("xml decode error: %v", err)
	}

	styles := p.parseStyles(r)

	return p.convert(doc, styles), nil
}

func (p *DocParser) parseStyles(r *zip.ReadCloser) map[string]Style {
	styles := make(map[string]Style)
	var stylesFile *zip.File
	for _, f := range r.File {
		if f.Name == "word/styles.xml" {
			stylesFile = f
			break
		}
	}
	if stylesFile == nil {
		return styles
	}

	rc, err := stylesFile.Open()
	if err != nil {
		return styles
	}
	defer rc.Close()

	var doc StylesDoc
	bytes, err := io.ReadAll(rc)
	if err != nil || xml.Unmarshal(bytes, &doc) != nil {
		return styles
	}
	for _, style := range doc.Styles {
		if style.StyleID != "" {
			styles[style.StyleID] = style
		}
	}
	return styles
}

func (p *DocParser) applyStyleDefaults(pp *ParsedParagraph, styles map[string]Style, seen map[string]bool) {
	if pp.StyleID == "" || len(styles) == 0 {
		return
	}
	if seen == nil {
		seen = make(map[string]bool)
	}
	style, ok := styles[pp.StyleID]
	if !ok || seen[pp.StyleID] {
		return
	}
	seen[pp.StyleID] = true

	if style.BasedOn != nil && style.BasedOn.Val != "" {
		parent := *pp
		parent.StyleID = style.BasedOn.Val
		p.applyStyleDefaults(&parent, styles, seen)
		fillMissingParagraphProps(pp, parent)
	}

	if style.PPr != nil {
		if pp.Alignment == "" && style.PPr.Jc != nil {
			pp.Alignment = style.PPr.Jc.Val
		}
		if pp.FirstLineIndentMm == 0 && style.PPr.Ind != nil && style.PPr.Ind.FirstLine != "" {
			pp.FirstLineIndentMm = twipsToMm(style.PPr.Ind.FirstLine)
		}
		if pp.LineSpacing == 0 && style.PPr.Spacing != nil && style.PPr.Spacing.Line != "" {
			if val, err := strconv.Atoi(style.PPr.Spacing.Line); err == nil {
				pp.LineSpacing = float64(val) / 240.0
			}
		}
	}
	if style.RPr != nil {
		applyRunDefaults(pp, style.RPr)
	}
}

func fillMissingParagraphProps(target *ParsedParagraph, source ParsedParagraph) {
	if target.Alignment == "" {
		target.Alignment = source.Alignment
	}
	if target.LineSpacing == 0 {
		target.LineSpacing = source.LineSpacing
	}
	if target.FirstLineIndentMm == 0 {
		target.FirstLineIndentMm = source.FirstLineIndentMm
	}
	if target.FontName == "" {
		target.FontName = source.FontName
	}
	if target.FontSizePt == 0 {
		target.FontSizePt = source.FontSizePt
	}
	target.IsBold = target.IsBold || source.IsBold
	target.IsItalic = target.IsItalic || source.IsItalic
	target.IsUnderline = target.IsUnderline || source.IsUnderline
	target.IsAllCaps = target.IsAllCaps || source.IsAllCaps
}

func applyRunDefaults(pp *ParsedParagraph, rpr *RPr) {
	if rpr == nil {
		return
	}
	if pp.FontName == "" && rpr.RFonts != nil {
		pp.FontName = firstNonEmpty(rpr.RFonts.Ascii, rpr.RFonts.HAnsi, rpr.RFonts.Cs, rpr.RFonts.EastAsia)
	}
	if pp.FontSizePt == 0 && rpr.Sz != nil && rpr.Sz.Val != "" {
		if val, err := strconv.Atoi(rpr.Sz.Val); err == nil {
			pp.FontSizePt = float64(val) / 2.0
		}
	}
	pp.IsBold = pp.IsBold || onOffEnabled(rpr.B)
	pp.IsItalic = pp.IsItalic || onOffEnabled(rpr.I)
	pp.IsUnderline = pp.IsUnderline || (rpr.U != nil && rpr.U.Val != "none")
	pp.IsAllCaps = pp.IsAllCaps || onOffEnabled(rpr.Caps)
}

// Convert internal XML model to simplified Check Model
func (p *DocParser) convert(doc Document, styles map[string]Style) *ParsedDoc {
	pd := &ParsedDoc{
		Stats: DocStats{
			TablesCount: len(doc.Body.Tbls),
		},
	}

	// Pre-scan to find modal (body) font size for heuristic heading detection
	bodyFontSize := p.detectBodyFontSize(doc)

	// Extract Tables
	for i, tbl := range doc.Body.Tbls {
		pt := ParsedTable{
			ID: fmt.Sprintf("tbl-%d", i+1),
		}

		if tbl.TblPr != nil {
			// Alignment
			if tbl.TblPr.Jc != nil {
				pt.Alignment = tbl.TblPr.Jc.Val
			}
			// Width
			if tbl.TblPr.TblW != nil {
				pt.WidthType = tbl.TblPr.TblW.Type
				if v, err := strconv.Atoi(tbl.TblPr.TblW.W); err == nil {
					pt.WidthValue = v
				}
			}
			// Cell spacing
			if tbl.TblPr.TblCellSpacing != nil {
				pt.CellSpacingMm = twipsToMm(tbl.TblPr.TblCellSpacing.W)
			}
			// Borders: check explicit tblBorders first
			if tbl.TblPr.TblBorders != nil {
				b := tbl.TblPr.TblBorders
				hasBorderVal := func(bv *BorderVal) bool {
					return bv != nil && bv.Val != "" && bv.Val != "none" && bv.Val != "nil"
				}
				pt.HasBorders = hasBorderVal(b.Top) || hasBorderVal(b.Bottom) ||
					hasBorderVal(b.Left) || hasBorderVal(b.Right)
				pt.HasInnerBorders = hasBorderVal(b.InsideH) || hasBorderVal(b.InsideV)
			}

			// Strategy 2: check tblStyle name — "TableGrid", "Table Grid", "Сетка" etc.
			// These built-in Word styles always have borders
			if !pt.HasBorders && tbl.TblPr.TblStyle != nil {
				styleName := strings.ToLower(tbl.TblPr.TblStyle.Val)
				borderedStyles := []string{"tablegrid", "table grid", "сетка", "grid", "bordered", "tablewithdividers"}
				for _, s := range borderedStyles {
					if strings.Contains(styleName, s) {
						pt.HasBorders = true
						pt.HasInnerBorders = true
						break
					}
				}
			}

			// Strategy 3: fallback — check first cell's tcBorders for any border definition
			if !pt.HasBorders && len(tbl.Trs) > 0 && len(tbl.Trs[0].Tcs) > 0 {
				firstCell := tbl.Trs[0].Tcs[0]
				if firstCell.TcPr != nil && firstCell.TcPr.TcBorders != nil {
					cb := firstCell.TcPr.TcBorders
					hasBorderVal := func(bv *BorderVal) bool {
						return bv != nil && bv.Val != "" && bv.Val != "none" && bv.Val != "nil"
					}
					if hasBorderVal(cb.Top) || hasBorderVal(cb.Bottom) ||
						hasBorderVal(cb.Left) || hasBorderVal(cb.Right) {
						pt.HasBorders = true
					}
				}
			}

			// TblLook flags
			if tbl.TblPr.TblLook != nil {

				look := tbl.TblPr.TblLook
				// firstRow attribute directly
				pt.HasHeaderRow = (look.FirstRow == "1" || look.FirstRow == "true")
				// noHBand = "1" means banding OFF; "0" or absent means banding ON
				pt.HasRowBanding = (look.NoHBand == "" || look.NoHBand == "0" || look.NoHBand == "false")
				pt.HasColBanding = (look.NoVBand == "" || look.NoVBand == "0" || look.NoVBand == "false")

				// Also parse hex bitmask from val attribute
				if look.Val != "" && len(look.Val) >= 4 {
					if hexVal, err := strconv.ParseInt(look.Val, 16, 32); err == nil {
						if hexVal&0x0020 != 0 {
							pt.HasHeaderRow = true
						}
						if hexVal&0x0200 == 0 {
							pt.HasRowBanding = true
						}
						if hexVal&0x0400 == 0 {
							pt.HasColBanding = true
						}
					}
				}
			}
		}

		// Check if first row is explicitly a header row via tblHeader property
		if len(tbl.Trs) > 0 && tbl.Trs[0].TrPr != nil && tbl.Trs[0].TrPr.TblHeader != nil {
			pt.HasHeaderRow = true
		}

		// Default alignment
		if pt.Alignment == "" {
			pt.Alignment = "left"
		}

		// Row & Col count + min row height
		pt.RowCount = len(tbl.Trs)
		if len(tbl.Trs) > 0 {
			pt.ColCount = len(tbl.Trs[0].Tcs)
		}
		// Also count from TblGrid
		if tbl.TblGrid != nil && pt.ColCount == 0 {
			pt.ColCount = len(tbl.TblGrid.GridCols)
		}
		// Parse min row height from all rows
		for _, row := range tbl.Trs {
			if row.TrPr != nil && row.TrPr.TrHeight != nil {
				hMm := twipsToMm(row.TrPr.TrHeight.Val)
				if hMm > 0 && (pt.MinRowHeightMm == 0 || hMm < pt.MinRowHeightMm) {
					pt.MinRowHeightMm = hMm
				}
			}
		}

		pd.Tables = append(pd.Tables, pt)
	}

	// Extract Sections Props (Margins & Size)
	var sectPr *SectPr
	if doc.Body.SectPr != nil {
		sectPr = doc.Body.SectPr
	}

	if sectPr != nil {
		if sectPr.PgMar != nil {
			pd.Margins.TopMm = twipsToMm(sectPr.PgMar.Top)
			pd.Margins.BottomMm = twipsToMm(sectPr.PgMar.Bottom)
			pd.Margins.LeftMm = twipsToMm(sectPr.PgMar.Left)
			pd.Margins.RightMm = twipsToMm(sectPr.PgMar.Right)
			pd.Margins.HeaderMm = twipsToMm(sectPr.PgMar.Header)
			pd.Margins.FooterMm = twipsToMm(sectPr.PgMar.Footer)
		}
		if sectPr.PgSz != nil {
			pd.PageSize.WidthMm = twipsToMm(sectPr.PgSz.W)
			pd.PageSize.HeightMm = twipsToMm(sectPr.PgSz.H)
			if sectPr.PgSz.Orient != "" {
				pd.PageSize.Orientation = sectPr.PgSz.Orient
			} else {
				if pd.PageSize.WidthMm > pd.PageSize.HeightMm {
					pd.PageSize.Orientation = "landscape"
				} else {
					pd.PageSize.Orientation = "portrait"
				}
			}
		}
	}

	currentPage := 1

	// Track captions for tables. A paragraph is a caption if its text starts with
	// "Таблица" / "Table" (followed by a number). We allow any number of blank
	// paragraphs between the caption and the table itself.
	// Extract Paragraphs
	for i, pXML := range doc.Body.Paragraphs {
		pp := ParsedParagraph{
			ID:              fmt.Sprintf("p-%d", i),
			Text:            p.extractText(pXML),
			StartsPageBreak: p.hasPageBreak(pXML),
			PageNumber:      currentPage,
		}

		runs := paragraphRuns(pXML)

		// Page break tracking
		hasDrawing := false
		for _, r := range runs {
			if r.Drawing != nil {
				pd.Stats.ImagesCount++
				hasDrawing = true
			}
			if (r.Br != nil && r.Br.Type == "page") || r.LastRenderedPageBreak != nil {
				currentPage++
			}
		}

		if pXML.PPr != nil {
			if pXML.PPr.Jc != nil {
				pp.Alignment = pXML.PPr.Jc.Val
			}
			if pXML.PPr.Ind != nil {
				pp.FirstLineIndentMm = twipsToMm(pXML.PPr.Ind.FirstLine)
			}
			if pXML.PPr.Spacing != nil {
				if pXML.PPr.Spacing.Line != "" {
					val, _ := strconv.Atoi(pXML.PPr.Spacing.Line)
					pp.LineSpacing = float64(val) / 240.0
				}
				// Spacing before/after in twips (1 twip = 1/20 pt)
				if pXML.PPr.Spacing.Before != "" {
					val, _ := strconv.Atoi(pXML.PPr.Spacing.Before)
					pp.SpacingBeforePt = float64(val) / 20.0
				}
				if pXML.PPr.Spacing.After != "" {
					val, _ := strconv.Atoi(pXML.PPr.Spacing.After)
					pp.SpacingAfterPt = float64(val) / 20.0
				}
			}

			pp.KeepLines = pXML.PPr.KeepLines != nil
			pp.KeepNext = pXML.PPr.KeepNext != nil
			if pXML.PPr.WidowControl != nil {
				pp.WidowControl = (pXML.PPr.WidowControl.Val == "on" || pXML.PPr.WidowControl.Val == "")
				if pXML.PPr.WidowControl.Val == "off" || pXML.PPr.WidowControl.Val == "0" || pXML.PPr.WidowControl.Val == "false" {
					pp.WidowControl = false
				}
			} else {
				pp.WidowControl = true
			}

			if pXML.PPr.PageBreakBefore != nil {
				pp.StartsPageBreak = true
				currentPage++
			}

			if pXML.PPr.PStyle != nil {
				pp.StyleID = pXML.PPr.PStyle.Val
			}
			if pXML.PPr.NumPr != nil {
				pp.IsListItem = true
				if pXML.PPr.NumPr.Ilvl != nil {
					lvl, _ := strconv.Atoi(pXML.PPr.NumPr.Ilvl.Val)
					pp.ListLevel = lvl
				}
			}
		} else {
			pp.WidowControl = true
		}

		p.applyStyleDefaults(&pp, styles, nil)

		// Font
		if len(runs) > 0 && runs[0].RPr != nil {
			rpr := runs[0].RPr
			if rpr.RFonts != nil {
				pp.FontName = rpr.RFonts.Ascii
			}
			if rpr.Sz != nil {
				val, _ := strconv.Atoi(rpr.Sz.Val)
				pp.FontSizePt = float64(val) / 2.0
			}
			pp.IsBold = onOffEnabled(rpr.B)
			pp.IsItalic = onOffEnabled(rpr.I)
			pp.IsUnderline = rpr.U != nil && rpr.U.Val != "none"
			pp.IsAllCaps = onOffEnabled(rpr.Caps)
		}
		if pp.FontName == "" {
			for _, r := range runs {
				if r.RPr != nil && r.RPr.RFonts != nil && r.RPr.RFonts.Ascii != "" {
					pp.FontName = r.RPr.RFonts.Ascii
					break
				}
			}
		}
		if pp.FontName == "" && len(runs) > 0 && runs[0].RPr != nil && runs[0].RPr.RFonts != nil {
			pp.FontName = runs[0].RPr.RFonts.HAnsi
		}
		if pp.FontSizePt == 0 {
			for _, r := range runs {
				if r.RPr != nil && r.RPr.Sz != nil && r.RPr.Sz.Val != "" {
					val, _ := strconv.Atoi(r.RPr.Sz.Val)
					pp.FontSizePt = float64(val) / 2.0
					break
				}
			}
		}
		pp.BoldRatio = calculateBoldRatio(runs)

		if hasDrawing {
			pd.Images = append(pd.Images, ParsedImage{
				ID:             fmt.Sprintf("img-%d", len(pd.Images)+1),
				ParagraphID:    pp.ID,
				ParagraphIndex: i,
				PageNumber:     pp.PageNumber,
				Alignment:      pp.Alignment,
			})
		}

		// Check for formulas (oMath directly in paragraph)
		if len(pXML.OMaths) > 0 {
			pp.HasFormula = true
			align := pp.Alignment
			// Check for (N) numbering in paragraph text
			hasNum := formulaNumberingRe.MatchString(strings.TrimSpace(pp.Text))
			for k := range pXML.OMaths {
				pd.Formulas = append(pd.Formulas, ParsedFormula{
					ID:           fmt.Sprintf("%s-omath-%d", pp.ID, k),
					WrapperID:    pp.ID,
					Alignment:    align,
					HasNumbering: hasNum,
				})
				pd.Stats.FormulasCount++
			}
		}
		// Check oMathPara (block-level formula)
		for k, omp := range pXML.OMathParas {
			pp.HasFormula = true
			align := pp.Alignment
			if omp.OMathParaPr != nil && omp.OMathParaPr.MJc != nil {
				align = omp.OMathParaPr.MJc.Val
				// normalize "centerGroup" → "center"
				if align == "centerGroup" {
					align = "center"
				}
			}
			hasNum := formulaNumberingRe.MatchString(strings.TrimSpace(pp.Text))
			pd.Formulas = append(pd.Formulas, ParsedFormula{
				ID:           fmt.Sprintf("%s-omathpara-%d", pp.ID, k),
				WrapperID:    pp.ID,
				Alignment:    align,
				HasNumbering: hasNum,
			})
			pd.Stats.FormulasCount++
		}

		// Heuristic heading detection for documents where students typed headings
		// manually instead of using Word heading styles.
		if !isHeadingStyle(pp.StyleID) && strings.TrimSpace(pp.Text) != "" {
			if ok, level := detectHeuristicHeading(pp, bodyFontSize); ok {
				pp.HeuristicHeading = true
				pp.HeuristicLevel = level
			}
		}

		pp.Role = classifyParagraphRole(pp)

		pd.Paragraphs = append(pd.Paragraphs, pp)
	}

	p.assignObjectCaptions(doc, pd, tableCaptionRe, figureCaptionRe)

	// NOTE: We intentionally do NOT fill in font defaults for paragraphs without run-level
	// font properties. Such paragraphs inherit their font from their paragraph style (e.g.
	// "Normal"), which we don't fully resolve here. Filling in fake defaults (e.g. TNR 12pt)
	// would cause false-positive font violations. The checker guards against FontName=="" and
	// FontSizePt==0 by skipping those paragraphs.

	pd.Stats.TotalPages = currentPage
	return pd
}

func (p *DocParser) assignObjectCaptions(doc Document, pd *ParsedDoc, tableCaptionRe, figureCaptionRe *regexp.Regexp) {
	paragraphInfo := func(idx int) tableCaptionInfo {
		if idx < 0 || idx >= len(pd.Paragraphs) {
			return tableCaptionInfo{}
		}
		pp := pd.Paragraphs[idx]
		return tableCaptionInfo{
			Text:      pp.Text,
			IndentMm:  pp.FirstLineIndentMm,
			BeforePt:  pp.SpacingBeforePt,
			AfterPt:   pp.SpacingAfterPt,
			Alignment: pp.Alignment,
		}
	}

	findPrevCaption := func(blockPos int, re *regexp.Regexp) (tableCaptionInfo, bool) {
		for i := blockPos - 1; i >= 0; i-- {
			block := doc.Body.Blocks[i]
			if block.Kind == "tbl" {
				return tableCaptionInfo{}, false
			}
			if block.Kind != "p" || block.Index < 0 || block.Index >= len(pd.Paragraphs) {
				continue
			}
			text := strings.TrimSpace(pd.Paragraphs[block.Index].Text)
			if text == "" {
				continue
			}
			if re.MatchString(text) {
				return paragraphInfo(block.Index), true
			}
			return tableCaptionInfo{}, false
		}
		return tableCaptionInfo{}, false
	}

	findNextCaption := func(blockPos int, re *regexp.Regexp) (tableCaptionInfo, bool) {
		for i := blockPos + 1; i < len(doc.Body.Blocks); i++ {
			block := doc.Body.Blocks[i]
			if block.Kind == "tbl" {
				return tableCaptionInfo{}, false
			}
			if block.Kind != "p" || block.Index < 0 || block.Index >= len(pd.Paragraphs) {
				continue
			}
			text := strings.TrimSpace(pd.Paragraphs[block.Index].Text)
			if text == "" {
				continue
			}
			if re.MatchString(text) {
				return paragraphInfo(block.Index), true
			}
			return tableCaptionInfo{}, false
		}
		return tableCaptionInfo{}, false
	}

	tableBlockPos := map[int]int{}
	imageBlockPos := map[int]int{}
	for blockPos, block := range doc.Body.Blocks {
		switch block.Kind {
		case "tbl":
			tableBlockPos[block.Index] = blockPos
		case "p":
			if block.Index >= 0 && block.Index < len(pd.Paragraphs) {
				for _, img := range pd.Images {
					if img.ParagraphIndex == block.Index {
						imageBlockPos[img.ParagraphIndex] = blockPos
					}
				}
			}
		}
	}

	for i := range pd.Tables {
		blockPos, ok := tableBlockPos[i]
		if !ok {
			continue
		}
		if info, found := findPrevCaption(blockPos, tableCaptionRe); found {
			pd.Tables[i].HasCaption = true
			pd.Tables[i].CaptionText = info.Text
			pd.Tables[i].CaptionNumber = extractCaptionNumber(info.Text, tableCaptionNumberRe)
			pd.Tables[i].CaptionAbove = true
			pd.Tables[i].CaptionHasDash = hasFlexibleDash(info.Text)
			pd.Tables[i].CaptionIndentMm = info.IndentMm
			pd.Tables[i].CaptionBeforePt = info.BeforePt
			pd.Tables[i].CaptionAfterPt = info.AfterPt
			pd.Tables[i].CaptionAlignment = info.Alignment
			continue
		}
		if info, found := findNextCaption(blockPos, tableCaptionRe); found {
			pd.Tables[i].HasCaption = true
			pd.Tables[i].CaptionText = info.Text
			pd.Tables[i].CaptionNumber = extractCaptionNumber(info.Text, tableCaptionNumberRe)
			pd.Tables[i].CaptionAbove = false
			pd.Tables[i].CaptionHasDash = hasFlexibleDash(info.Text)
			pd.Tables[i].CaptionIndentMm = info.IndentMm
			pd.Tables[i].CaptionBeforePt = info.BeforePt
			pd.Tables[i].CaptionAfterPt = info.AfterPt
			pd.Tables[i].CaptionAlignment = info.Alignment
		}
	}

	for i := range pd.Images {
		blockPos, ok := imageBlockPos[pd.Images[i].ParagraphIndex]
		if !ok {
			continue
		}
		if info, found := findNextCaption(blockPos, figureCaptionRe); found {
			pd.Images[i].HasCaption = true
			pd.Images[i].CaptionText = info.Text
			pd.Images[i].CaptionNumber = extractCaptionNumber(info.Text, figureCaptionNumberRe)
			pd.Images[i].CaptionBelow = true
			pd.Images[i].CaptionHasDash = hasFlexibleDash(info.Text)
			pd.Images[i].CaptionIndentMm = info.IndentMm
			pd.Images[i].CaptionBeforePt = info.BeforePt
			pd.Images[i].CaptionAfterPt = info.AfterPt
			pd.Images[i].CaptionAlignment = info.Alignment
			continue
		}
		if info, found := findPrevCaption(blockPos, figureCaptionRe); found {
			pd.Images[i].HasCaption = true
			pd.Images[i].CaptionText = info.Text
			pd.Images[i].CaptionNumber = extractCaptionNumber(info.Text, figureCaptionNumberRe)
			pd.Images[i].CaptionBelow = false
			pd.Images[i].CaptionHasDash = hasFlexibleDash(info.Text)
			pd.Images[i].CaptionIndentMm = info.IndentMm
			pd.Images[i].CaptionBeforePt = info.BeforePt
			pd.Images[i].CaptionAfterPt = info.AfterPt
			pd.Images[i].CaptionAlignment = info.Alignment
		}
	}
}

func extractCaptionNumber(text string, re *regexp.Regexp) string {
	m := re.FindStringSubmatch(strings.ReplaceAll(text, "\u00a0", " "))
	if len(m) < 2 {
		return ""
	}
	return strings.ReplaceAll(strings.TrimSpace(m[1]), "-", ".")
}

// detectBodyFontSize scans all runs and returns the most common font size (modal value),
// which is used as the baseline for heuristic heading detection.
func (p *DocParser) detectBodyFontSize(doc Document) float64 {
	sizeCounts := make(map[float64]int)
	for _, para := range doc.Body.Paragraphs {
		// Skip clearly-styled headings
		if para.PPr != nil && para.PPr.PStyle != nil && isHeadingStyle(para.PPr.PStyle.Val) {
			continue
		}
		for _, run := range para.R {
			if run.RPr != nil && run.RPr.Sz != nil && run.RPr.Sz.Val != "" {
				val, err := strconv.Atoi(run.RPr.Sz.Val)
				if err == nil && val > 0 {
					sizePt := float64(val) / 2.0
					sizeCounts[sizePt]++
				}
			}
		}
	}
	best := 0.0
	bestCount := 0
	for sz, cnt := range sizeCounts {
		if cnt > bestCount {
			bestCount = cnt
			best = sz
		}
	}
	return best
}

func paragraphRuns(para Paragraph) []Run {
	runs := make([]Run, 0, len(para.R))
	runs = append(runs, para.R...)
	for _, h := range para.Hyperlinks {
		runs = append(runs, h.R...)
	}
	for _, f := range para.FldSimples {
		runs = append(runs, f.R...)
	}
	return runs
}

func (p *DocParser) extractText(para Paragraph) string {
	var sb strings.Builder
	for _, run := range paragraphRuns(para) {
		if run.Text != nil {
			sb.WriteString(run.Text.Content)
		}
		if run.Tab != nil {
			sb.WriteString("\t")
		}
	}
	return sb.String()
}

func (p *DocParser) hasPageBreak(para Paragraph) bool {
	if para.PPr != nil && para.PPr.PageBreakBefore != nil {
		return true
	}
	for _, run := range paragraphRuns(para) {
		if run.Br != nil && run.Br.Type == "page" {
			return true
		}
	}
	return false
}

// ExtractConfig analyzes the parsed document to deduce a Standard Configuration.
func (pd *ParsedDoc) ExtractConfig() map[string]interface{} {
	config := make(map[string]interface{})

	// 1. Page Setup (Margins & Size)
	config["margins"] = map[string]float64{
		"top":       pd.Margins.TopMm,
		"bottom":    pd.Margins.BottomMm,
		"left":      pd.Margins.LeftMm,
		"right":     pd.Margins.RightMm,
		"tolerance": 2.5,
	}

	config["page_setup"] = map[string]interface{}{
		"orientation": pd.PageSize.Orientation,
	}

	// 2. Statistical Analysis of body text
	fontCounts := make(map[string]int)
	sizeCounts := make(map[float64]int)
	spacingCounts := make(map[float64]int)
	alignCounts := make(map[string]int)
	indentCounts := make(map[float64]int)

	for _, p := range pd.Paragraphs {
		if strings.TrimSpace(p.Text) == "" || p.StyleID != "" {
			continue
		}
		if p.FontName != "" {
			fontCounts[p.FontName]++
		}
		if p.FontSizePt > 0 {
			sizeCounts[p.FontSizePt]++
		}
		if p.LineSpacing > 0 {
			spacingCounts[p.LineSpacing]++
		}
		if p.Alignment != "" {
			alignCounts[p.Alignment]++
		}
		indentCounts[p.FirstLineIndentMm]++
	}

	getModeStr := func(m map[string]int) string {
		max := 0
		val := ""
		for k, v := range m {
			if v > max {
				max = v
				val = k
			}
		}
		return val
	}
	getModeFloat := func(m map[float64]int) float64 {
		max := 0
		val := 0.0
		for k, v := range m {
			if v > max {
				max = v
				val = k
			}
		}
		return val
	}

	mostCommonFont := getModeStr(fontCounts)
	if mostCommonFont == "" {
		mostCommonFont = "Times New Roman"
	}
	mostCommonSize := getModeFloat(sizeCounts)
	if mostCommonSize == 0 {
		mostCommonSize = 14.0
	}

	config["font"] = map[string]interface{}{
		"name": mostCommonFont,
		"size": mostCommonSize,
	}

	config["paragraph"] = map[string]interface{}{
		"line_spacing":      getModeFloat(spacingCounts),
		"alignment":         getModeStr(alignCounts),
		"first_line_indent": getModeFloat(indentCounts),
	}

	config["typography"] = map[string]bool{
		"forbid_bold":      false,
		"forbid_italic":    false,
		"forbid_underline": false,
		"forbid_all_caps":  false,
	}

	config["code_blocks"] = map[string]interface{}{
		"enabled":           false,
		"font_name":         "Consolas",
		"font_size":         12.0,
		"line_spacing":      1.0,
		"first_line_indent": 0.0,
		"alignment":         "left",
	}

	config["headings"] = map[string]interface{}{
		"enabled": false,
		"levels": map[string]interface{}{
			"1": map[string]interface{}{"check_bold": true, "require_bold": true, "check_font_size": false, "font_size": 16.0, "check_alignment": false, "alignment": "center", "check_all_caps": false, "require_all_caps": false},
			"2": map[string]interface{}{"check_bold": true, "require_bold": true, "check_font_size": false, "font_size": 14.0, "check_alignment": false, "alignment": "left", "check_all_caps": false, "require_all_caps": false},
			"3": map[string]interface{}{"check_bold": false, "require_bold": false, "check_font_size": false, "font_size": 14.0, "check_alignment": false, "alignment": "left", "check_all_caps": false, "require_all_caps": false},
		},
	}

	config["structure"] = map[string]interface{}{
		"heading_1_start_new_page": true,
		"heading_hierarchy":        true,
		"list_alignment":           "left",
		"verify_toc":               false,
	}

	config["scope"] = map[string]interface{}{
		"start_page":      2,
		"min_pages":       pd.Stats.TotalPages,
		"max_pages":       0,
		"forbidden_words": "",
	}

	// 3. Tables: infer settings from parsed tables
	tblAlignment := "center"
	requireCaption := false
	requireBorders := false
	requireHeaderRow := false
	captionAbove := true

	if len(pd.Tables) > 0 {
		alignVotes := make(map[string]int)
		captionCount := 0
		borderCount := 0
		headerCount := 0
		captionAboveCount := 0

		for _, t := range pd.Tables {
			if t.Alignment != "" {
				alignVotes[t.Alignment]++
			}
			if t.HasCaption {
				captionCount++
				if t.CaptionAbove {
					captionAboveCount++
				}
			}
			if t.HasBorders || t.HasInnerBorders {
				borderCount++
			}
			if t.HasHeaderRow {
				headerCount++
			}
		}
		tblAlignment = getModeStr(alignVotes)
		if tblAlignment == "" {
			tblAlignment = "center"
		}
		total := len(pd.Tables)
		if captionCount > total/2 {
			requireCaption = true
		}
		if borderCount > total/2 {
			requireBorders = true
		}
		if headerCount > total/2 {
			requireHeaderRow = true
		}
		captionAbove = captionAboveCount >= captionCount/2+1
	}

	captionPos := "top"
	if !captionAbove {
		captionPos = "bottom"
	}

	config["tables"] = map[string]interface{}{
		"caption_position":       captionPos,
		"alignment":              tblAlignment,
		"require_caption":        requireCaption,
		"caption_keyword":        "Таблица",
		"require_borders":        requireBorders,
		"require_header_row":     requireHeaderRow,
		"check_caption_layout":   false,
		"caption_indent_mm":      0.0,
		"caption_max_spacing_pt": 0.0,
		"caption_alignment":      "left",
		"check_sequence":         false,
		"numbering_mode":         "auto",
		"check_text_references":  false,
		"max_width_pct":          0,
	}

	imageAlign := "center"
	imageCaptionPos := "bottom"
	imageRequireCaption := false
	if len(pd.Images) > 0 {
		alignVotes := make(map[string]int)
		captionCount := 0
		captionBelowCount := 0
		for _, img := range pd.Images {
			if img.Alignment != "" {
				alignVotes[img.Alignment]++
			}
			if img.HasCaption {
				captionCount++
				if img.CaptionBelow {
					captionBelowCount++
				}
			}
		}
		if align := getModeStr(alignVotes); align != "" {
			imageAlign = align
		}
		if captionCount > len(pd.Images)/2 {
			imageRequireCaption = true
		}
		if captionCount > 0 && captionBelowCount < captionCount/2+1 {
			imageCaptionPos = "top"
		}
	}

	config["images"] = map[string]interface{}{
		"caption_position":       imageCaptionPos,
		"alignment":              imageAlign,
		"require_caption":        imageRequireCaption,
		"caption_keyword":        "Рисунок",
		"caption_dash_format":    true,
		"check_caption_layout":   false,
		"caption_indent_mm":      0.0,
		"caption_max_spacing_pt": 0.0,
		"caption_alignment":      "center",
		"check_sequence":         false,
		"numbering_mode":         "auto",
		"check_text_references":  false,
	}

	// 4. Formulas: infer from parsed formulas
	fmAlign := "center"
	requireNumbering := false

	if len(pd.Formulas) > 0 {
		fmAligns := make(map[string]int)
		numCount := 0
		for _, f := range pd.Formulas {
			if f.Alignment != "" {
				fmAligns[f.Alignment]++
			}
			if f.HasNumbering {
				numCount++
			}
		}
		a := getModeStr(fmAligns)
		if a != "" {
			fmAlign = a
		}
		if numCount > len(pd.Formulas)/2 {
			requireNumbering = true
		}
	}

	config["formulas"] = map[string]interface{}{
		"alignment":          fmAlign,
		"require_numbering":  requireNumbering,
		"numbering_position": "right",
		"numbering_format":   "(1)",
	}

	return config
}

// Helpers
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func classifyParagraphRole(p ParsedParagraph) string {
	text := strings.TrimSpace(p.Text)
	if text == "" {
		return ""
	}
	lowerText := strings.ToLower(text)
	lowerStyle := strings.ToLower(p.StyleID)

	if p.HasFormula {
		return "formula"
	}
	if strings.HasPrefix(lowerStyle, "toc") || strings.HasPrefix(lowerStyle, "table of contents") || tocEntryRe.MatchString(text) {
		return "toc"
	}
	if tableCaptionRe.MatchString(text) {
		return "table_caption"
	}
	if figureCaptionRe.MatchString(text) {
		return "figure_caption"
	}
	if isHeadingParagraph(p) {
		return "heading"
	}
	if p.IsListItem {
		return "list"
	}
	if strings.Contains(lowerText, "список литературы") || strings.Contains(lowerText, "список использованных источников") ||
		strings.Contains(lowerText, "references") {
		return "references_heading"
	}
	return "body"
}

func hasFlexibleDash(s string) bool {
	return strings.Contains(s, "—") || strings.Contains(s, "–") || regexp.MustCompile(`\s-\s`).MatchString(s)
}

func onOffEnabled(v *OnOff) bool {
	if v == nil {
		return false
	}
	switch strings.ToLower(v.Val) {
	case "0", "false", "off", "none":
		return false
	default:
		return true
	}
}

func calculateBoldRatio(runs []Run) float64 {
	total := 0
	bold := 0
	for _, r := range runs {
		if r.Text == nil || strings.TrimSpace(r.Text.Content) == "" {
			continue
		}
		total++
		if r.RPr != nil && onOffEnabled(r.RPr.B) {
			bold++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(bold) / float64(total)
}

func detectHeuristicHeading(p ParsedParagraph, bodyFontSize float64) (bool, int) {
	text := strings.TrimSpace(p.Text)
	if text == "" || len([]rune(text)) > 180 {
		return false, 0
	}
	lower := strings.ToLower(text)
	noSentenceEnd := !strings.HasSuffix(text, ".") && !strings.HasSuffix(text, ";") && !strings.HasSuffix(text, ",")

	if tocEntryRe.MatchString(text) || strings.HasPrefix(strings.ToLower(p.StyleID), "toc") ||
		tableCaptionRe.MatchString(text) || figureCaptionRe.MatchString(text) {
		return false, 0
	}

	if match := headingNumberingRe.FindStringSubmatch(text); len(match) > 1 && noSentenceEnd {
		level := strings.Count(match[1], ".") + 1
		if level > 3 {
			level = 3
		}
		return true, level
	}

	knownH1 := map[string]bool{
		"введение": true, "заключение": true, "содержание": true, "оглавление": true,
		"список литературы": true, "список использованных источников": true,
	}
	clean := strings.TrimSpace(strings.Trim(lower, ".:; "))
	if knownH1[clean] {
		return true, 1
	}
	if strings.HasPrefix(clean, "приложение ") {
		return true, 1
	}

	sizeDelta := 0.0
	if bodyFontSize > 0 && p.FontSizePt > 0 {
		sizeDelta = p.FontSizePt - bodyFontSize
	}
	isShortTitle := len([]rune(text)) <= 120 && noSentenceEnd
	looksSeparated := p.Alignment == "center" || p.IsBold || p.IsAllCaps || visibleTextAllCapsLocal(text) || sizeDelta >= 0.5
	if isShortTitle && looksSeparated {
		if sizeDelta >= 3 || p.Alignment == "center" || visibleTextAllCapsLocal(text) {
			return true, 1
		}
		if sizeDelta >= 1.5 || p.IsBold {
			return true, 2
		}
		return true, 3
	}

	return false, 0
}

func visibleTextAllCapsLocal(text string) bool {
	letters := 0
	lowerLetters := 0
	for _, r := range text {
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= 'А' && r <= 'я') || r == 'Ё' || r == 'ё') {
			continue
		}
		letters++
		if strings.ToLower(string(r)) == string(r) && strings.ToUpper(string(r)) != string(r) {
			lowerLetters++
		}
	}
	return letters >= 3 && lowerLetters == 0
}

func twipsToMm(twipsStr string) float64 {
	val, err := strconv.Atoi(twipsStr)
	if err != nil {
		return 0
	}
	return float64(val) * 25.4 / 1440.0
}

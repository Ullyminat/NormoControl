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
	Formulas   []ParsedFormula
	Stats      DocStats
}

type ParsedTable struct {
	ID              string
	Alignment       string // left, right, center
	WidthType       string // auto, pct, dxa
	WidthValue      int    // value in the width unit
	HasHeaderRow    bool   // TblLook firstRow flag or explicit tblHeader on first row
	HasRowBanding   bool   // row banding (noHBand = false → banding ON)
	HasColBanding   bool   // col banding
	HasBorders      bool   // true if tblBorders has at least one non-nil border
	HasInnerBorders bool   // true if insideH or insideV are defined
	CellSpacingMm   float64
	RowCount        int
	ColCount        int
	MinRowHeightMm  float64 // smallest explicit row height found (0 if no heights set)
	HasCaption      bool
	CaptionText     string
	CaptionAbove    bool // true = caption above table, false = below
	CaptionHasDash  bool // caption contains em-dash '–' or '—' (ESKD requirement)
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
	Alignment         string  // left, center, right, both
	LineSpacing       float64 // Generic multiplier (e.g. 1.5)
	FirstLineIndentMm float64
	SpacingBeforePt   float64 // w:spacing w:before in points
	SpacingAfterPt    float64 // w:spacing w:after in points

	// Typography
	FontName    string
	FontSizePt  float64
	IsBold      bool
	IsItalic    bool
	IsUnderline bool
	IsAllCaps   bool

	// Structure
	ID              string // specific ID e.g. "p-1", "p-2"
	StyleID         string // e.g. "Heading1"
	IsListItem      bool   // true if numPr exists
	ListLevel       int    // ilvl
	StartsPageBreak bool   // if explicit break is found
	HasFormula      bool   // true if paragraph contains oMath or oMathPara

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

	return p.convert(doc), nil
}

// Convert internal XML model to simplified Check Model
func (p *DocParser) convert(doc Document) *ParsedDoc {
	pd := &ParsedDoc{
		Stats: DocStats{
			TablesCount: len(doc.Body.Tbls),
		},
	}

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

	// Track captions for tables: paragraph immediately before a table index
	// We'll build a caption lookup: table index → caption paragraph
	// Since Body separates Paragraphs and Tbls, we use a heuristic:
	// Any paragraph whose text starts with "Таблица" or "Table" and contains a digit
	// is treated as a caption. We try to match them to tables in order.
	captionKeywords := []string{"таблица", "table"}
	captionRe := regexp.MustCompile(`(?i)^(таблица|table)\s+`)
	tableCaptionQueue := []string{}

	// Extract Paragraphs
	for i, pXML := range doc.Body.Paragraphs {
		pp := ParsedParagraph{
			ID:              fmt.Sprintf("p-%d", i),
			Text:            p.extractText(pXML),
			StartsPageBreak: p.hasPageBreak(pXML),
			PageNumber:      currentPage,
		}

		// Page break tracking
		for _, r := range pXML.R {
			if r.Drawing != nil {
				pd.Stats.ImagesCount++
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

		// Font
		if len(pXML.R) > 0 && pXML.R[0].RPr != nil {
			rpr := pXML.R[0].RPr
			if rpr.RFonts != nil {
				pp.FontName = rpr.RFonts.Ascii
			}
			if rpr.Sz != nil {
				val, _ := strconv.Atoi(rpr.Sz.Val)
				pp.FontSizePt = float64(val) / 2.0
			}
			pp.IsBold = rpr.B != nil
			pp.IsItalic = rpr.I != nil
			pp.IsUnderline = rpr.U != nil && rpr.U.Val != "none"
			pp.IsAllCaps = rpr.Caps != nil
		}
		if pp.FontName == "" {
			for _, r := range pXML.R {
				if r.RPr != nil && r.RPr.RFonts != nil && r.RPr.RFonts.Ascii != "" {
					pp.FontName = r.RPr.RFonts.Ascii
					break
				}
			}
		}
		if pp.FontName == "" && len(pXML.R) > 0 && pXML.R[0].RPr != nil && pXML.R[0].RPr.RFonts != nil {
			pp.FontName = pXML.R[0].RPr.RFonts.HAnsi
		}
		if pp.FontSizePt == 0 {
			for _, r := range pXML.R {
				if r.RPr != nil && r.RPr.Sz != nil && r.RPr.Sz.Val != "" {
					val, _ := strconv.Atoi(r.RPr.Sz.Val)
					pp.FontSizePt = float64(val) / 2.0
					break
				}
			}
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

		// Detect caption paragraphs for tables
		textLower := strings.ToLower(strings.TrimSpace(pp.Text))
		isCaption := false
		for _, kw := range captionKeywords {
			if strings.HasPrefix(textLower, kw) {
				isCaption = true
				break
			}
		}
		if isCaption && captionRe.MatchString(pp.Text) {
			tableCaptionQueue = append(tableCaptionQueue, pp.Text)
		}

		pd.Paragraphs = append(pd.Paragraphs, pp)
	}

	// Assign captions to tables in order
	for i := range pd.Tables {
		if i < len(tableCaptionQueue) {
			pd.Tables[i].HasCaption = true
			pd.Tables[i].CaptionText = tableCaptionQueue[i]
			pd.Tables[i].CaptionAbove = true
			// Check for em-dash (ESKD format: "Таблица 1 – ...")
			captionT := tableCaptionQueue[i]
			pd.Tables[i].CaptionHasDash = strings.Contains(captionT, "–") || strings.Contains(captionT, "—")
		}
	}

	// Fill in font defaults for empty fonts
	for i := range pd.Paragraphs {
		p := &pd.Paragraphs[i]
		if p.FontName == "" && strings.TrimSpace(p.Text) != "" {
			p.FontName = "Times New Roman"
		}
		if p.FontSizePt == 0 && strings.TrimSpace(p.Text) != "" {
			p.FontSizePt = 12.0
		}
	}

	pd.Stats.TotalPages = currentPage
	return pd
}

func (p *DocParser) extractText(para Paragraph) string {
	var sb strings.Builder
	for _, run := range para.R {
		if run.Text != nil {
			sb.WriteString(run.Text.Content)
		}
	}
	return sb.String()
}

func (p *DocParser) hasPageBreak(para Paragraph) bool {
	if para.PPr != nil && para.PPr.PageBreakBefore != nil {
		return true
	}
	for _, run := range para.R {
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
		"caption_position":   captionPos,
		"alignment":          tblAlignment,
		"require_caption":    requireCaption,
		"caption_keyword":    "Таблица",
		"require_borders":    requireBorders,
		"require_header_row": requireHeaderRow,
		"max_width_pct":      0,
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
func twipsToMm(twipsStr string) float64 {
	val, err := strconv.Atoi(twipsStr)
	if err != nil {
		return 0
	}
	return float64(val) * 25.4 / 1440.0
}

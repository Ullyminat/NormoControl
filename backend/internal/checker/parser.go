package checker

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
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
	ID        string
	Alignment string // left, right, center
	// Width?
	// Caption?
}

type ParsedFormula struct {
	ID        string
	WrapperID string // Paragraph ID containing it
	// Content?
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

	// Page Scope
	PageNumber int // Estimated page number

	// Flow
	KeepLines    bool
	KeepNext     bool
	WidowControl bool // true if on (default usually on in Word)
}

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
			ID: fmt.Sprintf("tbl-%d", i),
		}
		if tbl.TblPr != nil && tbl.TblPr.Jc != nil {
			pt.Alignment = tbl.TblPr.Jc.Val
		}
		// Default alignment often is left if not specified
		if pt.Alignment == "" {
			pt.Alignment = "left"
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
				// Infer from W/H? Or default
				if pd.PageSize.WidthMm > pd.PageSize.HeightMm {
					pd.PageSize.Orientation = "landscape"
				} else {
					pd.PageSize.Orientation = "portrait"
				}
			}
		}
	}

	currentPage := 1

	// Extract Paragraphs
	for i, pXML := range doc.Body.Paragraphs {
		// Check for page breaks WITHIN the paragraph runs
		// Often explicit breaks are at the END of a run or beginning.
		// LastRenderedPageBreak is usually a hint from Word's last save.

		pp := ParsedParagraph{
			ID:              fmt.Sprintf("p-%d", i),
			Text:            p.extractText(pXML),
			StartsPageBreak: p.hasPageBreak(pXML),
			PageNumber:      currentPage,
		}

		// If ANY run has a page break, we increment *after* this paragraph (roughly)
		// Or if it starts with one, we increment *before*?
		// Keeping it simple: If found, assume it ends the previous page.
		// Actually, <w:br type="page"> forces a new page.

		// Drawing Count logic (simple)
		for _, r := range pXML.R {
			if r.Drawing != nil {
				pd.Stats.ImagesCount++
			}
			// Update page count if break found
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
			if pXML.PPr.Spacing != nil && pXML.PPr.Spacing.Line != "" {
				val, _ := strconv.Atoi(pXML.PPr.Spacing.Line)
				pp.LineSpacing = float64(val) / 240.0
			}

			// Flow Control
			pp.KeepLines = pXML.PPr.KeepLines != nil
			pp.KeepNext = pXML.PPr.KeepNext != nil
			if pXML.PPr.WidowControl != nil {
				pp.WidowControl = (pXML.PPr.WidowControl.Val == "on" || pXML.PPr.WidowControl.Val == "") // "on" or just existing often implies on
				if pXML.PPr.WidowControl.Val == "off" || pXML.PPr.WidowControl.Val == "0" || pXML.PPr.WidowControl.Val == "false" {
					pp.WidowControl = false
				}
			} else {
				pp.WidowControl = true // Word default is usually ON
			}

			// Page Break Before (NEW: most common way to start a new page)
			if pXML.PPr.PageBreakBefore != nil {
				pp.StartsPageBreak = true
				// This paragraph starts on a new page
				currentPage++
			}

			// Structure (Style & Lists)
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
			pp.WidowControl = true // Default
		}

		// Font: check the first Run
		if len(pXML.R) > 0 && pXML.R[0].RPr != nil {
			rpr := pXML.R[0].RPr
			if rpr.RFonts != nil {
				pp.FontName = rpr.RFonts.Ascii
			}
			if rpr.Sz != nil {
				val, _ := strconv.Atoi(rpr.Sz.Val)
				pp.FontSizePt = float64(val) / 2.0
			}
			// Typography
			pp.IsBold = rpr.B != nil
			pp.IsItalic = rpr.I != nil
			pp.IsUnderline = rpr.U != nil && rpr.U.Val != "none"
			pp.IsAllCaps = rpr.Caps != nil
		}

		// CRITICAL FIX: If first run has no font info, check other runs
		if pp.FontName == "" {
			for _, r := range pXML.R {
				if r.RPr != nil && r.RPr.RFonts != nil && r.RPr.RFonts.Ascii != "" {
					pp.FontName = r.RPr.RFonts.Ascii
					break
				}
			}
		}

		// If still no font, try HAnsi (sometimes Ascii is empty but HAnsi is set)
		if pp.FontName == "" && len(pXML.R) > 0 && pXML.R[0].RPr != nil && pXML.R[0].RPr.RFonts != nil {
			pp.FontName = pXML.R[0].RPr.RFonts.HAnsi
		}

		// CRITICAL FIX: Default font size if not found
		if pp.FontSizePt == 0 {
			for _, r := range pXML.R {
				if r.RPr != nil && r.RPr.Sz != nil && r.RPr.Sz.Val != "" {
					val, _ := strconv.Atoi(r.RPr.Sz.Val)
					pp.FontSizePt = float64(val) / 2.0
					break
				}
			}
		}

		// If we incremented page in the loop, strictly speaking the TEXT might span across.
		// For checking purposes, assigning the start page is usually okay.

		// Check for formulas (oMath)
		// 1. Inline in Runs? (Not in our simplified model yet, usually in p.OMaths or r.OMath)
		// We added OMaths to Paragraph struct in xml_models
		if len(pXML.OMaths) > 0 {
			for k := range pXML.OMaths {
				pd.Formulas = append(pd.Formulas, ParsedFormula{
					ID:        fmt.Sprintf("%s-omath-%d", pp.ID, k),
					WrapperID: pp.ID,
				})
				pd.Stats.FormulasCount++
			}
		}

		// Also check for formulas inside runs (inline math <m:oMathPara> or <m:oMath> can be inside runs?)
		// Microsoft Word XML structure for math:
		// <m:oMathPara> -- block level
		// <m:oMath> -- inline usually, but can be block
		// We currently only mapped Paragraph.OMaths.
		// If they are inside Runs, we might miss them.
		// For now, let's assume if it's a "Formula", it might be a paragraph with just math?
		// or inline.
		// Let's rely on what we have mappings for.

		pd.Paragraphs = append(pd.Paragraphs, pp)
	}

	// CRITICAL: After all paragraphs are parsed, fill in defaults for empty fonts
	// This is crucial for ExtractConfig to work properly
	for i := range pd.Paragraphs {
		p := &pd.Paragraphs[i]
		// Default to Times New Roman if font is missing (Word default)
		if p.FontName == "" && strings.TrimSpace(p.Text) != "" {
			p.FontName = "Times New Roman"
		}
		// Default to 12pt if size is missing (Word default for body text)
		if p.FontSizePt == 0 && strings.TrimSpace(p.Text) != "" {
			p.FontSizePt = 12.0
		}
	}

	// Final page count
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
	// Check for <w:pageBreakBefore/> in paragraph properties (most common)
	if para.PPr != nil && para.PPr.PageBreakBefore != nil {
		return true
	}

	// Check for explicit <w:br type="page"/> in runs
	for _, run := range para.R {
		if run.Br != nil && run.Br.Type == "page" {
			return true
		}
	}
	return false
}

// ExtractConfig analyzes the parsed document to deduce a Standard Configuration.
// Enhanced for PageSetup, Typography stats, and Flow.
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
		// We could add exact width/height checks too, but orientation is most common
	}

	// 2. Statistical Analysis
	fontCounts := make(map[string]int)
	sizeCounts := make(map[float64]int)
	spacingCounts := make(map[float64]int)
	alignCounts := make(map[string]int)
	indentCounts := make(map[float64]int)

	// Typography & Flow - we want to see if "Majority" is bold or not?
	// Usually body text is NOT bold. So we probably just want to Default these to "Forbid" if we are strict?
	// Or we can say: if >50% is bold, then allow it? No, standard usually forbids it.
	// For "Magic Import", let's assume if the document is clean, it has NO bold in body.

	for _, p := range pd.Paragraphs {
		if strings.TrimSpace(p.Text) == "" || p.StyleID != "" {
			continue
		} // Ignore headings for body text stats

		// CRITICAL FIX: Skip paragraphs with empty font name
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
		mostCommonFont = "Times New Roman" // Default fallback
	}

	mostCommonSize := getModeFloat(sizeCounts)
	if mostCommonSize == 0 {
		mostCommonSize = 14.0 // Default for academic docs
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

	// Default rigorous settings for imported standards
	config["typography"] = map[string]bool{
		"forbid_bold":      true,
		"forbid_italic":    true,
		"forbid_underline": true,
	}

	// 3. Structure Analysis (Simple inference)
	// If we detect styles "Heading1", "Heading2", we can propose enabling structure checks.
	// For now, defaults:
	config["structure"] = map[string]interface{}{
		"heading_1_start_new_page": true,
		"heading_hierarchy":        true,
		"list_alignment":           "left", // default assumption
	}

	// 4. Scope & Limits
	config["scope"] = map[string]interface{}{
		"start_page":      2, // Assume first page is title
		"min_pages":       pd.Stats.TotalPages,
		"max_pages":       0,
		"forbidden_words": "",
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

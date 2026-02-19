package checker

import "encoding/xml"

// OpenXML Structures for parsing word/document.xml

type Document struct {
	XMLName xml.Name `xml:"document"`
	Body    Body     `xml:"body"`
}

type Body struct {
	SectPr *SectPr `xml:"sectPr"`
	// We need to capture both P and Tbl in order.
	// XML unwrapping for mixed content is tricky in Go without a custom UnmarshalXML.
	// For simplicity, we might iterate children if possible, but standard encoding/xml
	// with "any" can work if we define a wrapper.
	// However, usually we just list them:
	Paragraphs []Paragraph `xml:"p"`
	Tbls       []Tbl       `xml:"tbl"`
}

// Helper to capture order?
// Only if we REALLY need precise order of P vs Tbl. For checking "Caption is above Table", we DO need order.
// Let's try to map the whole Body content if possible, but that's complex.
// Alternative: We stick to separate lists for now, but we lose context of "what is above what".
// actually, `xml:",any"` on a slice of structs doesn't filter by type automatically in a useful way for us unless we write custom unmarshaler.
// Let's stick to parsing `Paragraphs` and `Tbls` separately for now.
// To correlate captions, we might need a better parser or assume captions are "close" by index if we had a flat list.
// For now, let's just parse Tbls and formulas within Ps.

type Paragraph struct {
	PPr  *PPr  `xml:"pPr"`
	R    []Run `xml:"r"`
	Text string
	// Math can be directly in P or in R? usually in P or R logic.
	OMaths []OMath `xml:"oMath"` // Check for formulas
}

type Run struct {
	RPr                   *RPr     `xml:"rPr"`
	Text                  *Text    `xml:"t"`
	Br                    *Br      `xml:"br"`                    // Explicit breaks
	Drawing               *Drawing `xml:"drawing"`               // Images
	LastRenderedPageBreak *Empty   `xml:"lastRenderedPageBreak"` // Soft breaks
}

type Tbl struct {
	XMLName xml.Name `xml:"tbl"`
	TblPr   *TblPr   `xml:"tblPr"`
	Trs     []Tr     `xml:"tr"`
}

type TblPr struct {
	Jc *Jc `xml:"jc"` // Table alignment
}

type Tr struct {
	Tcs []Tc `xml:"tc"`
}

type Tc struct {
	P []Paragraph `xml:"p"`
}

type OMath struct {
	XMLName xml.Name `xml:"oMath"`
}

type Drawing struct {
	XMLName xml.Name `xml:"drawing"`
}

type Text struct {
	Content string `xml:",chardata"`
	Space   string `xml:"space,attr,omitempty"`
}

// Properties

type PPr struct {
	Jc              *Jc           `xml:"jc"`
	Spacing         *Spacing      `xml:"spacing"`
	Ind             *Ind          `xml:"ind"`
	SectPr          *SectPr       `xml:"sectPr"`
	RPr             *RPr          `xml:"rPr"`
	KeepLines       *Empty        `xml:"keepLines"`
	KeepNext        *Empty        `xml:"keepNext"`
	WidowControl    *WidowControl `xml:"widowControl"`
	PageBreakBefore *Empty        `xml:"pageBreakBefore"` // NEW: Page break before paragraph
	PStyle          *Val          `xml:"pStyle"`          // Style ID (Heading 1, etc.)
	NumPr           *NumPr        `xml:"numPr"`           // List properties
}

type NumPr struct {
	Ilvl  *Val `xml:"ilvl"`  // Indent level
	NumId *Val `xml:"numId"` // Numbering ID
}

type Br struct {
	Type string `xml:"type,attr"` // page, column, textWrapping
}

type RPr struct {
	RFonts *RFonts `xml:"rFonts"`
	Sz     *Val    `xml:"sz"`
	B      *Empty  `xml:"b"`
	I      *Empty  `xml:"i"`
	U      *Val    `xml:"u"`
	Caps   *Empty  `xml:"caps"`
	Strike *Empty  `xml:"strike"`
}

type SectPr struct {
	PgMar *PgMar `xml:"pgMar"`
	PgSz  *PgSz  `xml:"pgSz"`
}

// Attributes

type Jc struct {
	Val string `xml:"val,attr"`
}

type Spacing struct {
	After    string `xml:"after,attr"`
	Line     string `xml:"line,attr"` // Twips
	LineRule string `xml:"lineRule,attr"`
}

type Ind struct {
	FirstLine string `xml:"firstLine,attr"`
	Left      string `xml:"left,attr"`
	Right     string `xml:"right,attr"`
}

type WidowControl struct {
	Val string `xml:"val,attr"`
}

type RFonts struct {
	Ascii    string `xml:"ascii,attr"`
	HAnsi    string `xml:"hAnsi,attr"`
	Cs       string `xml:"cs,attr"`
	EastAsia string `xml:"eastAsia,attr"`
}

type Val struct {
	Val string `xml:"val,attr"`
}

type PgMar struct {
	Top    string `xml:"top,attr"`
	Right  string `xml:"right,attr"`
	Bottom string `xml:"bottom,attr"`
	Left   string `xml:"left,attr"`
	Header string `xml:"header,attr"`
	Footer string `xml:"footer,attr"`
}

type PgSz struct {
	W      string `xml:"w,attr"`
	H      string `xml:"h,attr"`
	Orient string `xml:"orient,attr"`
}

type Empty struct{}

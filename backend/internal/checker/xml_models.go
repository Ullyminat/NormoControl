package checker

import "encoding/xml"

// OpenXML Structures for parsing word/document.xml

type Document struct {
	XMLName xml.Name `xml:"document"`
	Body    Body     `xml:"body"`
}

type Body struct {
	Paragraphs []Paragraph `xml:"p"`
	Tbls       []Tbl       `xml:"tbl"` // Tables check (simple existence)
	SectPr     *SectPr     `xml:"sectPr"`
}

type Paragraph struct {
	PPr  *PPr  `xml:"pPr"`
	R    []Run `xml:"r"`
	Text string
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
	Jc           *Jc           `xml:"jc"`
	Spacing      *Spacing      `xml:"spacing"`
	Ind          *Ind          `xml:"ind"`
	SectPr       *SectPr       `xml:"sectPr"`
	RPr          *RPr          `xml:"rPr"`
	KeepLines    *Empty        `xml:"keepLines"`
	KeepNext     *Empty        `xml:"keepNext"`
	WidowControl *WidowControl `xml:"widowControl"`
	PStyle       *Val          `xml:"pStyle"` // Style ID (Heading 1, etc.)
	NumPr        *NumPr        `xml:"numPr"`  // List properties
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
	Line     string `xml:"line,attr"`
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

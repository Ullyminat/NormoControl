package checker

import "encoding/xml"

// OpenXML Structures for parsing word/document.xml

type Document struct {
	XMLName xml.Name `xml:"document"`
	Body    Body     `xml:"body"`
}

type Body struct {
	SectPr     *SectPr     `xml:"sectPr"`
	Paragraphs []Paragraph `xml:"p"`
	Tbls       []Tbl       `xml:"tbl"`
	Blocks     []BodyBlock
}

type BodyBlock struct {
	Kind  string
	Index int
}

func (b *Body) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	*b = Body{}
	for {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "p":
				var p Paragraph
				if err := d.DecodeElement(&p, &t); err != nil {
					return err
				}
				b.Paragraphs = append(b.Paragraphs, p)
				b.Blocks = append(b.Blocks, BodyBlock{Kind: "p", Index: len(b.Paragraphs) - 1})
			case "tbl":
				var tbl Tbl
				if err := d.DecodeElement(&tbl, &t); err != nil {
					return err
				}
				b.Tbls = append(b.Tbls, tbl)
				b.Blocks = append(b.Blocks, BodyBlock{Kind: "tbl", Index: len(b.Tbls) - 1})
			case "sectPr":
				var sect SectPr
				if err := d.DecodeElement(&sect, &t); err != nil {
					return err
				}
				b.SectPr = &sect
			default:
				var skip struct{}
				if err := d.DecodeElement(&skip, &t); err != nil {
					return err
				}
			}
		case xml.EndElement:
			if t.Name == start.Name {
				return nil
			}
		}
	}
}

type Paragraph struct {
	PPr        *PPr        `xml:"pPr"`
	R          []Run       `xml:"r"`
	Hyperlinks []Hyperlink `xml:"hyperlink"`
	FldSimples []FldSimple `xml:"fldSimple"`
	Text       string
	OMaths     []OMath `xml:"oMath"` // Check for formulas
	// Block-level formula paragraph container
	OMathParas []OMathPara `xml:"oMathPara"`
}

type Hyperlink struct {
	R []Run `xml:"r"`
}

type FldSimple struct {
	R []Run `xml:"r"`
}

type Run struct {
	RPr                   *RPr     `xml:"rPr"`
	Text                  *Text    `xml:"t"`
	InstrText             *Text    `xml:"instrText"`
	Tab                   *Empty   `xml:"tab"`
	Br                    *Br      `xml:"br"`                    // Explicit breaks
	Drawing               *Drawing `xml:"drawing"`               // Images
	LastRenderedPageBreak *Empty   `xml:"lastRenderedPageBreak"` // Soft breaks
}

// --- Table Structures ---

type Tbl struct {
	XMLName xml.Name `xml:"tbl"`
	TblPr   *TblPr   `xml:"tblPr"`
	TblGrid *TblGrid `xml:"tblGrid"`
	Trs     []Tr     `xml:"tr"`
}

type TblPr struct {
	Jc             *Jc             `xml:"jc"`             // Table alignment
	TblW           *TblW           `xml:"tblW"`           // Table width
	TblBorders     *TblBorders     `xml:"tblBorders"`     // Table outer/inner borders
	TblCellSpacing *TblCellSpacing `xml:"tblCellSpacing"` // Space between cells
	TblCellMar     *TblCellMar     `xml:"tblCellMar"`     // Default cell margins
	TblLook        *TblLook        `xml:"tblLook"`        // Table style options (header row, banding, etc.)
	TblStyle       *Val            `xml:"tblStyle"`       // Style name
}

// TblW – table width: type="auto"|"pct"|"dxa"|"nil", w=value
type TblW struct {
	W    string `xml:"w,attr"`
	Type string `xml:"type,attr"`
}

// TblGrid – column widths
type TblGrid struct {
	GridCols []GridCol `xml:"gridCol"`
}

type GridCol struct {
	W string `xml:"w,attr"`
}

// TblBorders – all six borders of a table
type TblBorders struct {
	Top     *BorderVal `xml:"top"`
	Bottom  *BorderVal `xml:"bottom"`
	Left    *BorderVal `xml:"left"`
	Right   *BorderVal `xml:"right"`
	InsideH *BorderVal `xml:"insideH"`
	InsideV *BorderVal `xml:"insideV"`
}

type BorderVal struct {
	Val   string `xml:"val,attr"`
	Sz    string `xml:"sz,attr"`
	Color string `xml:"color,attr"`
}

type TblCellSpacing struct {
	W    string `xml:"w,attr"`
	Type string `xml:"type,attr"`
}

// TblCellMar – default cell margins for all cells
type TblCellMar struct {
	Top    *TblMarVal `xml:"top"`
	Bottom *TblMarVal `xml:"bottom"`
	Left   *TblMarVal `xml:"left"`
	Right  *TblMarVal `xml:"right"`
}

type TblMarVal struct {
	W    string `xml:"w,attr"`
	Type string `xml:"type,attr"`
}

// TblLook – appearance flags: val is a hex bitmask
// bit 0x0020 = firstRow (header), 0x0040 = lastRow, 0x0080 = firstCol,
// 0x0100 = lastCol, 0x0200 = noHBand, 0x0400 = noVBand
type TblLook struct {
	Val      string `xml:"val,attr"`
	FirstRow string `xml:"firstRow,attr"`
	LastRow  string `xml:"lastRow,attr"`
	FirstCol string `xml:"firstColumn,attr"`
	LastCol  string `xml:"lastColumn,attr"`
	NoHBand  string `xml:"noHBand,attr"`
	NoVBand  string `xml:"noVBand,attr"`
}

type Tr struct {
	TrPr *TrPr `xml:"trPr"`
	Tcs  []Tc  `xml:"tc"`
}

type TrPr struct {
	TblHeader *Empty    `xml:"tblHeader"` // Row is a header row
	TrHeight  *TrHeight `xml:"trHeight"`  // Row height constraint
}

// TrHeight – row height: hRule="exact"|"atLeast"|"auto", val in twips
type TrHeight struct {
	Val   string `xml:"val,attr"`
	HRule string `xml:"hRule,attr"` // "exact", "atLeast", or absent (auto)
}

type Tc struct {
	TcPr *TcPr       `xml:"tcPr"`
	P    []Paragraph `xml:"p"`
}

type TcPr struct {
	TcW       *TblW       `xml:"tcW"`       // Cell width
	VAlign    *Val        `xml:"vAlign"`    // Vertical alignment: top, center, bottom
	Shd       *Shd        `xml:"shd"`       // Cell shading/background
	TcBorders *TblBorders `xml:"tcBorders"` // Per-cell border overrides
}

type Shd struct {
	Val   string `xml:"val,attr"`
	Color string `xml:"color,attr"`
	Fill  string `xml:"fill,attr"`
}

// --- Math / Formula Structures ---

type OMathPara struct {
	XMLName     xml.Name     `xml:"oMathPara"`
	OMathParaPr *OMathParaPr `xml:"oMathParaPr"`
	OMath       *OMath       `xml:"oMath"`
}

type OMathParaPr struct {
	MJc *MJc `xml:"jc"`
}

// MJc – math justification: "left", "center", "right", "centerGroup"
type MJc struct {
	Val string `xml:"val,attr"`
}

type OMath struct {
	XMLName xml.Name `xml:"oMath"`
}

// --- Other Run-Level Elements ---

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
	PageBreakBefore *Empty        `xml:"pageBreakBefore"` // Page break before paragraph
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
	B      *OnOff  `xml:"b"`
	I      *OnOff  `xml:"i"`
	U      *Val    `xml:"u"`
	Caps   *OnOff  `xml:"caps"`
	Strike *OnOff  `xml:"strike"`
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
	Before   string `xml:"before,attr"` // Twips before paragraph
	After    string `xml:"after,attr"`  // Twips after paragraph
	Line     string `xml:"line,attr"`   // Twips
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

type OnOff struct {
	Val string `xml:"val,attr"`
}

// StylesDoc is a small subset of word/styles.xml. It lets the checker understand
// formatting inherited from paragraph styles instead of trusting only run-level
// formatting in document.xml.
type StylesDoc struct {
	Styles []Style `xml:"style"`
}

type Style struct {
	Type    string     `xml:"type,attr"`
	StyleID string     `xml:"styleId,attr"`
	Name    *StyleName `xml:"name"`
	BasedOn *Val       `xml:"basedOn"`
	PPr     *PPr       `xml:"pPr"`
	RPr     *RPr       `xml:"rPr"`
}

type StyleName struct {
	Val string `xml:"val,attr"`
}

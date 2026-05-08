package checker

import (
	"academic-check-sys/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// CheckService orchestrates the check
type CheckService struct {
	Parser *DocParser
}

func NewCheckService() *CheckService {
	return &CheckService{
		Parser: NewDocParser(),
	}
}

var (
	codeKeywordPattern   = regexp.MustCompile(`(?i)^\s*(package|import|const|let|var|func|function|if|else|for|while|return|class|public|private|protected|def|from|using|namespace|select|insert|update|delete)\b`)
	codeOperatorPattern  = regexp.MustCompile("[{}();`]|=>|:=|==|!=|<=|>=|&&|\\|\\|")
	codeCallPattern      = regexp.MustCompile(`\w+\s*\([^)]*\)\s*[{;]?`)
	codeDeclarationRegex = regexp.MustCompile(`(?i)\b(json|xml|yaml):["']?[a-z0-9_-]+|^\s*[A-Za-z_][A-Za-z0-9_]*\s+[*\[\]A-Za-z0-9_.]+`)
	codeIndentedPattern  = regexp.MustCompile(`^\s{2,}\S`)
	tocNumberPrefixRegex = regexp.MustCompile(`^[\d\p{L}]+(?:\.[\d\p{L}]+)*\.?\s+`)
	punctRegex           = regexp.MustCompile(`[^\p{L}\p{N}]+`)
	tocLineRegex         = regexp.MustCompile(`^(.+?)(?:[\.\_\-\s]{2,}|\t+|\s)(\d{1,3})$`)
	headingPrefixRegex   = regexp.MustCompile(`^\s*(\d+(?:\.\d+)*)\.?\s+(.+)$`)
	tableRefRegex        = regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}])(?:таблиц(?:[аеуы]|ей)|табл\.)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*([0-9]+(?:[\.\-][0-9]+)*)`)
	figureRefRegex       = regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}])(?:рисунк(?:[аеуы]|ом)|рис\.|figure|fig\.)\s*(?:№|n|no\.?)?\s*[:\.\-–—]?\s*([0-9]+(?:[\.\-][0-9]+)*)`)
)

// ConfigSchema defines what the frontend Standard JSON should look like
type ConfigSchema struct {
	Margins      MarginsConfig      `json:"margins"`
	Font         FontConfig         `json:"font"`
	Paragraph    ParagraphConfig    `json:"paragraph"`
	PageSetup    PageSetupConfig    `json:"page_setup"`
	HeaderFooter HeaderFooterConfig `json:"header_footer"` // New
	Typography   TypographyConfig   `json:"typography"`
	CodeBlocks   CodeBlockConfig    `json:"code_blocks"`
	Headings     HeadingsConfig     `json:"headings"`
	Structure    StructureConfig    `json:"structure"`
	Scope        ScopeConfig        `json:"scope"`        // New
	Introduction IntroductionConfig `json:"introduction"` // New
	Tables       TableConfig        `json:"tables"`       // New
	Images       ImageConfig        `json:"images"`       // New
	Formulas     FormulaConfig      `json:"formulas"`     // New
	References   ReferencesConfig   `json:"references"`   // New
}

// ReferencesConfig holds settings for the bibliography section check.
type ReferencesConfig struct {
	Required          bool   `json:"required"`
	TitleKeyword      string `json:"title_keyword"`        // e.g. "Список литературы"
	CheckSourceAge    bool   `json:"check_source_age"`     // Enable year-age check
	MaxSourceAgeYears int    `json:"max_source_age_years"` // 0 = use 5 as default
}

type TableConfig struct {
	CaptionPosition     string  `json:"caption_position"`    // top, bottom, none
	Alignment           string  `json:"alignment"`           // left, center, right
	RequireCaption      bool    `json:"require_caption"`     // must have a caption
	CaptionKeyword      string  `json:"caption_keyword"`     // default "Таблица"
	CaptionDashFormat   bool    `json:"caption_dash_format"` // caption must contain em-dash (ЕСКД)
	CheckCaptionLayout  bool    `json:"check_caption_layout"`
	CaptionIndentMm     float64 `json:"caption_indent_mm"`
	CaptionMaxSpacingPt float64 `json:"caption_max_spacing_pt"`
	CaptionAlignment    string  `json:"caption_alignment"`
	CheckSequence       bool    `json:"check_sequence"`
	NumberingMode       string  `json:"numbering_mode"` // auto, plain, section
	CheckTextReferences bool    `json:"check_text_references"`
	RequireBorders      bool    `json:"require_borders"`    // table must have outer borders
	RequireHeaderRow    bool    `json:"require_header_row"` // first row must be header
	MinRowHeightMm      float64 `json:"min_row_height_mm"`  // 0 = ignore; ESKD = 8.0
	MaxWidthPct         int     `json:"max_width_pct"`      // 0 = ignore
}

type ImageConfig struct {
	CaptionPosition     string  `json:"caption_position"` // bottom, top, none
	Alignment           string  `json:"alignment"`        // left, center, right
	RequireCaption      bool    `json:"require_caption"`
	CaptionKeyword      string  `json:"caption_keyword"`
	CaptionDashFormat   bool    `json:"caption_dash_format"`
	CheckCaptionLayout  bool    `json:"check_caption_layout"`
	CaptionIndentMm     float64 `json:"caption_indent_mm"`
	CaptionMaxSpacingPt float64 `json:"caption_max_spacing_pt"`
	CaptionAlignment    string  `json:"caption_alignment"`
	CheckSequence       bool    `json:"check_sequence"`
	NumberingMode       string  `json:"numbering_mode"` // auto, plain, section
	CheckTextReferences bool    `json:"check_text_references"`
}

type FormulaConfig struct {
	Alignment            string `json:"alignment"`              // left, center, right
	RequireNumbering     bool   `json:"require_numbering"`      // must have (N) label
	NumberingPosition    string `json:"numbering_position"`     // right, left
	NumberingFormat      string `json:"numbering_format"`       // "(1)", "(1.1)"
	RequireSpacingAround bool   `json:"require_spacing_around"` // empty line before/after formula
	CheckWhereNoColon    bool   `json:"check_where_no_colon"`   // «где» after formula must not have colon
}

type IntroductionConfig struct {
	MinPages                   int  `json:"min_pages"`
	MaxPages                   int  `json:"max_pages"`
	VerifyPageCountDeclaration bool `json:"verify_page_count_declaration"` // New: Check if text matches real pages
}

type ScopeConfig struct {
	StartPage      int    `json:"start_page"`
	MinPages       int    `json:"min_pages"`
	MaxPages       int    `json:"max_pages"`
	ForbiddenWords string `json:"forbidden_words"` // Comma-sep list
}

type MarginsConfig struct {
	Top       float64 `json:"top"`
	Bottom    float64 `json:"bottom"`
	Left      float64 `json:"left"`
	Right     float64 `json:"right"`
	Tolerance float64 `json:"tolerance"`
}

type PageSetupConfig struct {
	Orientation string `json:"orientation"` // portrait, landscape
}

type HeaderFooterConfig struct {
	HeaderDist float64 `json:"header_dist"`
	FooterDist float64 `json:"footer_dist"`
}

type TypographyConfig struct {
	ForbidBold      bool `json:"forbid_bold"`
	ForbidItalic    bool `json:"forbid_italic"`
	ForbidUnderline bool `json:"forbid_underline"`
	ForbidAllCaps   bool `json:"forbid_all_caps"`
}

type CodeBlockConfig struct {
	Enabled         bool    `json:"enabled"`
	FontName        string  `json:"font_name"`
	FontSize        float64 `json:"font_size"`
	LineSpacing     float64 `json:"line_spacing"`
	FirstLineIndent float64 `json:"first_line_indent"`
	Alignment       string  `json:"alignment"`
}

type HeadingsConfig struct {
	Enabled bool                          `json:"enabled"`
	Levels  map[string]HeadingLevelConfig `json:"levels"`
}

type HeadingLevelConfig struct {
	CheckBold      bool    `json:"check_bold"`
	RequireBold    bool    `json:"require_bold"`
	CheckFontSize  bool    `json:"check_font_size"`
	FontSize       float64 `json:"font_size"`
	CheckAlignment bool    `json:"check_alignment"`
	Alignment      string  `json:"alignment"`
	CheckAllCaps   bool    `json:"check_all_caps"`
	RequireAllCaps bool    `json:"require_all_caps"`
}

type StructureConfig struct {
	Heading1StartNewPage bool   `json:"heading_1_start_new_page"`
	HeadingHierarchy     bool   `json:"heading_hierarchy"`
	ListAlignment        string `json:"list_alignment"`
	VerifyTOC            bool   `json:"verify_toc"`
	SectionOrder         string `json:"section_order"` // comma-separated expected section names in order
}

type FontConfig struct {
	Name string  `json:"name"`
	Size float64 `json:"size"`
}

type ParagraphConfig struct {
	LineSpacing     float64 `json:"line_spacing"`
	Alignment       string  `json:"alignment"`
	FirstLineIndent float64 `json:"first_line_indent"`
}

func isCodeParagraph(p ParsedParagraph) bool {
	text := p.Text
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}

	style := strings.ToLower(p.StyleID)
	if strings.Contains(style, "code") || strings.Contains(style, "source") ||
		strings.Contains(style, "program") || strings.Contains(style, "listing") ||
		strings.Contains(style, "код") || strings.Contains(style, "листинг") {
		return true
	}

	font := strings.ToLower(p.FontName)
	monoFonts := []string{"consolas", "courier", "lucida console", "cascadia mono", "jetbrains mono", "source code", "menlo", "monaco"}
	for _, mono := range monoFonts {
		if strings.Contains(font, mono) {
			return true
		}
	}

	codeSignals := 0
	if codeKeywordPattern.MatchString(text) {
		codeSignals += 2
	}
	if codeOperatorPattern.MatchString(text) {
		codeSignals++
	}
	if codeCallPattern.MatchString(text) {
		codeSignals++
	}
	if codeDeclarationRegex.MatchString(text) {
		codeSignals++
	}
	if codeIndentedPattern.MatchString(text) {
		codeSignals++
	}
	if strings.Contains(trimmed, "</") || strings.Contains(trimmed, "/>") {
		codeSignals += 2
	}

	return codeSignals >= 2
}

func checkCodeParagraph(p ParsedParagraph, config CodeBlockConfig, pos string) ([]models.Violation, int) {
	violations := []models.Violation{}
	totalRules := 0

	if config.FontName != "" && p.FontName != "" {
		totalRules++
		if sameFont, isDoubtful := fontsEquivalent(p.FontName, config.FontName); !sameFont {
			violations = append(violations, models.Violation{
				RuleType: "code_font_name", Description: "Неверный шрифт блока кода", PositionInDoc: pos,
				ExpectedValue: config.FontName, ActualValue: p.FontName, Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  isDoubtful,
			})
		}
	}

	if config.FontSize > 0 && p.FontSizePt > 0 {
		totalRules++
		if math.Abs(p.FontSizePt-config.FontSize) > 0.5 {
			violations = append(violations, models.Violation{
				RuleType: "code_font_size", Description: "Неверный размер шрифта блока кода", PositionInDoc: pos,
				ExpectedValue: fmt.Sprintf("%.1f", config.FontSize), ActualValue: fmt.Sprintf("%.1f", p.FontSizePt), Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  math.Abs(p.FontSizePt-config.FontSize) <= 2.0,
			})
		}
	}

	if config.LineSpacing > 0 && p.LineSpacing > 0 {
		totalRules++
		if math.Abs(p.LineSpacing-config.LineSpacing) > 0.15 {
			violations = append(violations, models.Violation{
				RuleType: "code_line_spacing", Description: "Неверный межстрочный интервал блока кода", PositionInDoc: pos,
				ExpectedValue: fmt.Sprintf("%.2f", config.LineSpacing), ActualValue: fmt.Sprintf("%.2f", p.LineSpacing), Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  math.Abs(p.LineSpacing-config.LineSpacing) <= 0.3,
			})
		}
	}

	totalRules++
	if math.Abs(p.FirstLineIndentMm-config.FirstLineIndent) > 3.0 {
		violations = append(violations, models.Violation{
			RuleType: "code_indent", Description: "Неверный отступ первой строки блока кода", PositionInDoc: pos,
			ExpectedValue: fmt.Sprintf("%.1f мм", config.FirstLineIndent), ActualValue: fmt.Sprintf("%.1f мм", p.FirstLineIndentMm), Severity: "warning",
			ContextText: p.Text,
			IsDoubtful:  math.Abs(p.FirstLineIndentMm-config.FirstLineIndent) <= 6.0,
		})
	}

	expectedAlign := config.Alignment
	if expectedAlign != "" {
		totalRules++
		normExpected := expectedAlign
		if normExpected == "justify" {
			normExpected = "both"
		}
		normActual := p.Alignment
		if normActual == "start" || normActual == "" {
			normActual = "left"
		} else if normActual == "end" {
			normActual = "right"
		}
		if normActual != normExpected {
			violations = append(violations, models.Violation{
				RuleType: "code_alignment", Description: "Неверное выравнивание блока кода", PositionInDoc: pos,
				ExpectedValue: normExpected, ActualValue: normActual, Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  true,
			})
		}
	}

	return violations, totalRules
}

func normalizeFontName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	replacer := strings.NewReplacer(" ", "", "-", "", "_", "", ",", "", "\"", "", "'", "")
	name = replacer.Replace(name)
	aliases := map[string]string{
		"timesnewromanpsmt": "timesnewroman",
		"timesnewroman":     "timesnewroman",
		"times":             "timesnewroman",
		"tnr":               "timesnewroman",
		"arialmt":           "arial",
		"arial":             "arial",
		"calibribody":       "calibri",
		"calibri":           "calibri",
		"cambriamath":       "cambria",
		"couriernewpsmt":    "couriernew",
		"couriernew":        "couriernew",
		"consolas":          "consolas",
		"minorhansi":        "",
		"majorhansi":        "",
		"minoreastasia":     "",
		"majoreastasia":     "",
		"minorcs":           "",
		"majorcs":           "",
		"+minorhansi":       "",
		"+majorhansi":       "",
		"+minoreastasia":    "",
		"+majoreastasia":    "",
		"+minorcs":          "",
		"+majorcs":          "",
	}
	if alias, ok := aliases[name]; ok {
		return alias
	}
	return name
}

func fontsEquivalent(actual, expected string) (bool, bool) {
	a := normalizeFontName(actual)
	e := normalizeFontName(expected)
	if a == "" || e == "" {
		return true, true
	}
	if a == e {
		return true, false
	}
	if strings.Contains(a, e) || strings.Contains(e, a) {
		return true, true
	}
	return false, false
}

func shouldCheckBodyFormatting(p ParsedParagraph, inReferences bool) bool {
	if inReferences {
		return false
	}
	switch p.Role {
	case "toc", "table_caption", "figure_caption", "formula", "references_heading":
		return false
	default:
		return true
	}
}

func isReferenceHeading(text string, cfg ReferencesConfig) bool {
	keyword := strings.ToLower(strings.TrimSpace(cfg.TitleKeyword))
	if keyword == "" {
		keyword = "список литературы"
	}
	text = strings.ToLower(strings.TrimSpace(text))
	return strings.Contains(text, keyword) ||
		strings.Contains(text, "список использованных источников") ||
		strings.Contains(text, "references")
}

func normalizeAlignment(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "justify":
		return "both"
	case "start":
		return "left"
	case "end":
		return "right"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func violationPenalty(v models.Violation) float64 {
	penalty := 1.0
	if v.Severity == "warning" {
		penalty = 0.5
	}
	if v.IsDoubtful {
		penalty *= 0.5
	}
	return penalty
}

func visibleTextAllCaps(text string) bool {
	letters := 0
	lowerLetters := 0
	for _, r := range text {
		if !isLetter(r) {
			continue
		}
		letters++
		if strings.ToLower(string(r)) == string(r) && strings.ToUpper(string(r)) != string(r) {
			lowerLetters++
		}
	}
	return letters >= 3 && lowerLetters == 0
}

func isLetter(r rune) bool {
	return (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= 'А' && r <= 'я') || r == 'Ё' || r == 'ё'
}

func headingLevelConfig(config HeadingsConfig, level int) (HeadingLevelConfig, bool) {
	if !config.Enabled || level <= 0 || len(config.Levels) == 0 {
		return HeadingLevelConfig{}, false
	}
	if cfg, ok := config.Levels[strconv.Itoa(level)]; ok {
		return cfg, true
	}
	if cfg, ok := config.Levels["default"]; ok {
		return cfg, true
	}
	return HeadingLevelConfig{}, false
}

func checkHeadingParagraph(p ParsedParagraph, config HeadingsConfig, level int, pos string) ([]models.Violation, int) {
	levelConfig, ok := headingLevelConfig(config, level)
	if !ok {
		return nil, 0
	}

	violations := []models.Violation{}
	totalRules := 0
	isDoubtful := p.HeuristicHeading && !isHeadingStyle(p.StyleID)
	levelLabel := fmt.Sprintf("H%d", level)

	if levelConfig.CheckBold {
		totalRules++
		actualBold := p.IsBold || p.BoldRatio >= 0.4
		if actualBold != levelConfig.RequireBold {
			expected := "Жирный"
			actual := "Обычный"
			if !levelConfig.RequireBold {
				expected = "Обычный"
				actual = "Жирный"
			}
			violations = append(violations, models.Violation{
				RuleType: "heading_bold", Description: fmt.Sprintf("Неверное начертание заголовка %s", levelLabel), PositionInDoc: pos,
				ExpectedValue: expected, ActualValue: actual, Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  isDoubtful,
			})
		}
	}

	if levelConfig.CheckFontSize && levelConfig.FontSize > 0 && p.FontSizePt > 0 {
		totalRules++
		if math.Abs(p.FontSizePt-levelConfig.FontSize) > 0.75 {
			violations = append(violations, models.Violation{
				RuleType: "heading_font_size", Description: fmt.Sprintf("Неверный размер шрифта заголовка %s", levelLabel), PositionInDoc: pos,
				ExpectedValue: fmt.Sprintf("%.1f", levelConfig.FontSize), ActualValue: fmt.Sprintf("%.1f", p.FontSizePt), Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  isDoubtful || math.Abs(p.FontSizePt-levelConfig.FontSize) <= 2.0,
			})
		}
	}

	if levelConfig.CheckAlignment && levelConfig.Alignment != "" {
		totalRules++
		expected := levelConfig.Alignment
		if expected == "justify" {
			expected = "both"
		}
		actual := p.Alignment
		if actual == "" || actual == "start" {
			actual = "left"
		} else if actual == "end" {
			actual = "right"
		}
		if actual != expected {
			violations = append(violations, models.Violation{
				RuleType: "heading_alignment", Description: fmt.Sprintf("Неверное выравнивание заголовка %s", levelLabel), PositionInDoc: pos,
				ExpectedValue: expected, ActualValue: actual, Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  true,
			})
		}
	}

	if levelConfig.CheckAllCaps {
		totalRules++
		actualCaps := p.IsAllCaps || visibleTextAllCaps(p.Text)
		if actualCaps != levelConfig.RequireAllCaps {
			expected := "Все буквы заглавные"
			actual := "Обычный регистр"
			if !levelConfig.RequireAllCaps {
				expected = "Обычный регистр"
				actual = "Все буквы заглавные"
			}
			violations = append(violations, models.Violation{
				RuleType: "heading_caps", Description: fmt.Sprintf("Неверный регистр заголовка %s", levelLabel), PositionInDoc: pos,
				ExpectedValue: expected, ActualValue: actual, Severity: "warning",
				ContextText: p.Text,
				IsDoubtful:  isDoubtful,
			})
		}
	}

	return violations, totalRules
}

type tocEntry struct {
	Title  string
	Number string
	Page   int
	Text   string
}

func isTOCParagraph(p ParsedParagraph) bool {
	text := strings.TrimSpace(p.Text)
	style := strings.ToLower(p.StyleID)
	return p.Role == "toc" || strings.HasPrefix(style, "toc") ||
		strings.HasPrefix(style, "table of contents") || tocLineRegex.MatchString(text)
}

func splitHeadingNumber(text string) (string, string) {
	matches := headingPrefixRegex.FindStringSubmatch(strings.TrimSpace(text))
	if len(matches) < 3 {
		return "", strings.TrimSpace(text)
	}
	return matches[1], strings.TrimSpace(matches[2])
}

func looksLikeTOCEntryStart(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" || tocLineRegex.MatchString(text) {
		return false
	}
	lower := strings.ToLower(text)
	if headingNumberingRe.MatchString(text) {
		return true
	}
	return strings.HasPrefix(lower, "введение") ||
		strings.HasPrefix(lower, "заключение") ||
		strings.HasPrefix(lower, "список ") ||
		strings.HasPrefix(lower, "приложение ")
}

func appendTOCEntry(entries []tocEntry, text string) []tocEntry {
	matches := tocLineRegex.FindStringSubmatch(strings.TrimSpace(text))
	if len(matches) < 3 {
		return entries
	}
	page, err := strconv.Atoi(matches[2])
	if err != nil {
		return entries
	}
	rawTitle := strings.TrimRight(strings.TrimSpace(matches[1]), " ._-")
	number, title := splitHeadingNumber(rawTitle)
	return append(entries, tocEntry{Title: title, Number: number, Page: page, Text: text})
}

func extractTOCEntries(paragraphs []ParsedParagraph) []tocEntry {
	entries := []tocEntry{}
	pending := ""
	inTOC := false
	for _, p := range paragraphs {
		text := strings.TrimSpace(p.Text)
		if text == "" {
			continue
		}
		lowerText := strings.ToLower(text)

		if strings.Contains(lowerText, "содержание") || strings.Contains(lowerText, "оглавление") {
			inTOC = true
			pending = ""
			continue
		}
		if !inTOC && isTOCParagraph(p) {
			inTOC = true
		}
		if !inTOC {
			continue
		}

		if pending != "" {
			text = strings.TrimSpace(pending + " " + text)
		}

		matches := tocLineRegex.FindStringSubmatch(text)
		if len(matches) < 3 {
			if isTOCParagraph(p) || looksLikeTOCEntryStart(text) || pending != "" {
				pending = text
				continue
			}
			if len(entries) > 0 && p.Role == "heading" {
				break
			}
			continue
		}
		entries = appendTOCEntry(entries, text)
		pending = ""
	}

	// Fallback: some generated TOCs are not marked by Word styles and may not
	// have an explicit "Содержание" paragraph in extracted text. Parse every
	// visible line and stitch likely wrapped entries before giving up.
	if len(entries) == 0 {
		pending = ""
		for _, p := range paragraphs {
			text := strings.TrimSpace(p.Text)
			if text == "" {
				continue
			}
			if pending != "" {
				combined := strings.TrimSpace(pending + " " + text)
				if tocLineRegex.MatchString(combined) {
					entries = appendTOCEntry(entries, combined)
					pending = ""
					continue
				}
			}
			if tocLineRegex.MatchString(text) {
				entries = appendTOCEntry(entries, text)
				pending = ""
			} else if looksLikeTOCEntryStart(text) {
				pending = text
			}
		}
	}
	return entries
}

func tocTitlesMatch(a, b string) bool {
	na := normalizeForTOC(a)
	nb := normalizeForTOC(b)
	if na == "" || nb == "" {
		return false
	}
	if na == nb {
		return true
	}
	if len([]rune(na)) >= 12 && len([]rune(nb)) >= 12 {
		return strings.Contains(na, nb) || strings.Contains(nb, na)
	}
	return false
}

func checkTOCSequence(paragraphs []ParsedParagraph) ([]models.Violation, int) {
	entries := extractTOCEntries(paragraphs)
	if len(entries) == 0 {
		return []models.Violation{{
			RuleType:      "toc_not_detected",
			Description:   "Не удалось разобрать содержание для сверки",
			PositionInDoc: "Оглавление",
			ExpectedValue: "Строки содержания с названиями и страницами",
			ActualValue:   "Пункты содержания не найдены",
			Severity:      "warning",
			IsDoubtful:    true,
		}}, 1
	}

	headings := []ParsedParagraph{}
	for _, p := range paragraphs {
		if p.Role == "heading" && strings.TrimSpace(p.Text) != "" {
			headings = append(headings, p)
		}
	}

	violations := []models.Violation{}
	cursor := 0
	for _, entry := range entries {
		foundAt := -1
		for i := cursor; i < len(headings); i++ {
			_, headingTitle := splitHeadingNumber(headings[i].Text)
			if tocTitlesMatch(headingTitle, entry.Title) {
				foundAt = i
				break
			}
		}
		if foundAt == -1 {
			violations = append(violations, models.Violation{
				RuleType: "toc_order_missing", Description: fmt.Sprintf("Раздел из содержания не найден в тексте или идет не по порядку: '%s'", truncate(entry.Title, 40)), PositionInDoc: "Оглавление",
				ExpectedValue: "Раздел в тексте в том же порядке", ActualValue: "Не найден после предыдущего раздела", Severity: "warning",
				IsDoubtful:  true,
				ContextText: entry.Text,
			})
			continue
		}

		headingNumber, _ := splitHeadingNumber(headings[foundAt].Text)
		if entry.Number != "" && headingNumber != "" && entry.Number != headingNumber {
			violations = append(violations, models.Violation{
				RuleType: "toc_number_mismatch", Description: fmt.Sprintf("Номер раздела в содержании не совпадает с текстом: '%s'", truncate(entry.Title, 40)), PositionInDoc: "Оглавление",
				ExpectedValue: headingNumber, ActualValue: entry.Number, Severity: "warning",
				ContextText: entry.Text,
			})
		}
		if entry.Page > 0 && headings[foundAt].PageNumber > 0 && entry.Page != headings[foundAt].PageNumber {
			violations = append(violations, models.Violation{
				RuleType: "toc_page_mismatch", Description: fmt.Sprintf("Страница раздела в содержании не совпадает с текстом: '%s'", truncate(entry.Title, 40)), PositionInDoc: "Оглавление",
				ExpectedValue: fmt.Sprintf("Стр. %d", headings[foundAt].PageNumber), ActualValue: fmt.Sprintf("Стр. %d", entry.Page), Severity: "warning",
				ContextText: entry.Text,
				IsDoubtful:  math.Abs(float64(headings[foundAt].PageNumber-entry.Page)) <= 1,
			})
		}
		cursor = foundAt + 1
	}

	return violations, len(entries)
}

func (s *CheckService) RunCheck(ctx context.Context, filePath string, standardJSON string) (*models.CheckResult, []models.Violation, error) {
	// 0. Check Context
	if ctx.Err() != nil {
		return nil, nil, ctx.Err()
	}

	// 1. Parse Document
	doc, err := s.Parser.Parse(filePath)
	if err != nil {
		return nil, nil, err
	}

	// 2. Parse Config
	var config ConfigSchema
	if err := json.Unmarshal([]byte(standardJSON), &config); err != nil {
		return nil, nil, fmt.Errorf("invalid standard config: %v", err)
	}

	// 3. Verify
	violations := []models.Violation{}
	totalRules := 0

	// Check Context before heavy logic
	if ctx.Err() != nil {
		return nil, nil, ctx.Err()
	}

	// Check Margins
	vListMargins := checkMargins(doc.Margins, config.Margins)
	// Count only configured margin fields
	if config.Margins.Top > 0 {
		totalRules++
	}
	if config.Margins.Bottom > 0 {
		totalRules++
	}
	if config.Margins.Left > 0 {
		totalRules++
	}
	if config.Margins.Right > 0 {
		totalRules++
	}
	violations = append(violations, vListMargins...)

	// Check Page Setup
	if config.PageSetup.Orientation != "" && doc.PageSize.Orientation != "" {
		totalRules++
		if config.PageSetup.Orientation != doc.PageSize.Orientation {
			violations = append(violations, models.Violation{
				RuleType: "page_orientation", Description: "Incorrect Page Orientation",
				ExpectedValue: config.PageSetup.Orientation, ActualValue: doc.PageSize.Orientation, Severity: "error",
			})
		}
	}

	// Check Header/Footer
	if config.HeaderFooter.HeaderDist > 0 && math.Abs(doc.Margins.HeaderMm-config.HeaderFooter.HeaderDist) > 2.0 {
		totalRules++
		violations = append(violations, models.Violation{
			RuleType: "header_dist", Description: "Incorrect Header Distance", Severity: "error",
			ExpectedValue: fmt.Sprintf("%.1f mm", config.HeaderFooter.HeaderDist), ActualValue: fmt.Sprintf("%.1f mm", doc.Margins.HeaderMm),
		})
	} else if config.HeaderFooter.HeaderDist > 0 {
		totalRules++
	}

	if config.HeaderFooter.FooterDist > 0 && math.Abs(doc.Margins.FooterMm-config.HeaderFooter.FooterDist) > 2.0 {
		totalRules++
		violations = append(violations, models.Violation{
			RuleType: "footer_dist", Description: "Incorrect Footer Distance", Severity: "error",
			ExpectedValue: fmt.Sprintf("%.1f mm", config.HeaderFooter.FooterDist), ActualValue: fmt.Sprintf("%.1f mm", doc.Margins.FooterMm),
		})
	} else if config.HeaderFooter.FooterDist > 0 {
		totalRules++
	}

	// Check Tables
	tblViolations, tblRules := checkTables(doc.Tables, doc.Paragraphs, config.Tables)
	violations = append(violations, tblViolations...)
	totalRules += tblRules

	// Check Images
	imgViolations, imgRules := checkImages(doc.Images, doc.Paragraphs, config.Images)
	violations = append(violations, imgViolations...)
	totalRules += imgRules

	// Check Formulas (pass paragraphs for spacing/где checks)
	fmViolations, fmRules := checkFormulas(doc.Formulas, doc.Paragraphs, config.Formulas)
	violations = append(violations, fmViolations...)
	totalRules += fmRules

	// Check References (bibliography age)
	if config.References.Required || config.References.CheckSourceAge {
		refViolations, refRules := checkReferences(doc.Paragraphs, config.References)
		violations = append(violations, refViolations...)
		totalRules += refRules
	}

	if config.Structure.VerifyTOC {
		tocViolations, tocRules := checkTOCSequence(doc.Paragraphs)
		violations = append(violations, tocViolations...)
		totalRules += tocRules
	}

	// Check Paragraphs
	lastHeadingLevel := 0
	inReferencesSection := false
	for i, p := range doc.Paragraphs {
		// Skip blank paragraphs (empty text or whitespace only)
		trimmed := strings.TrimSpace(p.Text)
		if trimmed == "" {
			continue
		}

		// Page Scope Filter
		if config.Scope.StartPage > 1 && p.PageNumber < config.Scope.StartPage {
			// Skip checks for this paragraph as it is out of scope (e.g. title page)
			continue
		}

		// ID for Violation
		pos := fmt.Sprintf("Page %d, Para %d: %s...", p.PageNumber, i+1, truncate(trimmed, 100))

		isHeading := isHeadingParagraph(p)
		headingLevel := 0
		if isHeading {
			if isHeadingStyle(p.StyleID) {
				headingLevel = headingLevelFromStyle(p.StyleID)
			} else if p.HeuristicHeading {
				headingLevel = p.HeuristicLevel
			}
		}

		if isReferenceHeading(trimmed, config.References) {
			inReferencesSection = true
		} else if inReferencesSection && isHeading {
			inReferencesSection = false
		}

		if isHeading && headingLevel > 0 && p.Role != "toc" {
			headingViolations, headingRules := checkHeadingParagraph(p, config.Headings, headingLevel, pos)
			violations = append(violations, headingViolations...)
			totalRules += headingRules
		}

		// --- Structure Rules ---

		// 1. Heading 1 starts new page
		if config.Structure.Heading1StartNewPage && headingLevel == 1 && p.Role == "heading" && i > 0 {
			// Check if ANY of these conditions hold, which indicate a new page:
			// a) StartsPageBreak = explicit <w:br type="page"> in runs
			// b) The paragraph itself has PageBreakBefore PPr
			// c) It's on a different page than the previous heading (page tracker)
			// We check (a) and (b) via StartsPageBreak flag already.
			// Additionally check that the heading is not the very first paragraph on its page.
			prevNonEmpty := -1
			for j := i - 1; j >= 0; j-- {
				if strings.TrimSpace(doc.Paragraphs[j].Text) != "" {
					prevNonEmpty = j
					break
				}
			}
			// Only flag if there's a non-empty para before this heading AND it's on the same page AND no break
			if prevNonEmpty >= 0 && !p.StartsPageBreak && doc.Paragraphs[prevNonEmpty].PageNumber == p.PageNumber {
				violations = append(violations, models.Violation{
					RuleType: "structure_break", Description: "Заголовок 1 уровня должен начинаться с новой страницы", PositionInDoc: pos,
					ExpectedValue: "Разрыв страницы", ActualValue: "Предыдущий текст на той же странице", Severity: "warning",
				})
			}
		}

		// 2. Heading Hierarchy (1 -> 2 -> 3)
		if config.Structure.HeadingHierarchy && isHeading && p.Role == "heading" && headingLevel > 0 {
			if headingLevel > lastHeadingLevel+1 {
				violations = append(violations, models.Violation{
					RuleType: "structure_hierarchy", Description: fmt.Sprintf("Пропущен уровень заголовка: H%d после H%d", headingLevel, lastHeadingLevel), PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("Заголовок %d", lastHeadingLevel+1), ActualValue: fmt.Sprintf("Заголовок %d", headingLevel), Severity: "error",
				})
			}
			lastHeadingLevel = headingLevel
		}
		if !isHeading {
			// Reset hierarchy check? No, body text doesn't reset level.
		}

		// --- TOC Verification ---
		if config.Structure.VerifyTOC {
			text := strings.TrimSpace(p.Text)

			// Skip empty or very short TOC entries
			if len(text) >= 3 {
				isTOCStyle := strings.HasPrefix(strings.ToLower(p.StyleID), "toc") || strings.HasPrefix(strings.ToLower(p.StyleID), "table of contents") || strings.HasPrefix(strings.ToLower(p.StyleID), "оглавление")

				// Enhanced regex pattern to extract title and page number
				// Matches: "Title [dots/spaces/tabs] PageNumber"
				// Captures: 1=title, 2=page number. Requiring at least 2 separator chars prevents false positives
				tocPattern := `^(.+?)[\.\_\-\s]{2,}(\d+)$`
				re := regexp.MustCompile(tocPattern)
				matches := re.FindStringSubmatch(text)

				// It's a TOC entry if it has a TOC style, OR if it neatly matches the Title .... Page pattern
				if isTOCStyle || len(matches) >= 3 {
					if len(matches) >= 3 {
						titlePart := strings.TrimSpace(matches[1])
						pagePart := matches[2]

						// Clean up title: remove trailing dots, underscores, dashes, spaces
						titlePart = strings.TrimRight(titlePart, " ._-")

						if tocPage, err := strconv.Atoi(pagePart); err == nil {
							// Normalized title for fuzzy matching
							normTitle := normalizeForTOC(titlePart)

							// Build heading map once per document for efficiency
							headingMap := make(map[string]int)
							for _, targetP := range doc.Paragraphs {
								t := strings.TrimSpace(targetP.Text)
								if t != "" && isHeadingParagraph(targetP) {
									headingMap[normalizeForTOC(t)] = targetP.PageNumber
								}
							}

							if actualPage, found := headingMap[normTitle]; found {
								if actualPage != tocPage {
									isDoubtful := math.Abs(float64(actualPage-tocPage)) <= 1.0 // Only 1 page difference is doubtful
									violations = append(violations, models.Violation{
										RuleType: "toc_page_mismatch", Description: fmt.Sprintf("Несовпадение страниц в оглавлении для '%s'", truncate(titlePart, 20)), PositionInDoc: "Оглавление",
										ExpectedValue: fmt.Sprintf("Стр. %d", actualPage), ActualValue: fmt.Sprintf("Стр. %d", tocPage), Severity: "error",
										IsDoubtful:  isDoubtful,
										ContextText: text,
									})
								}
							} else {
								violations = append(violations, models.Violation{
									RuleType: "toc_missing_heading", Description: fmt.Sprintf("Раздел из оглавления не найден в тексте: '%s'", truncate(titlePart, 30)), PositionInDoc: "Оглавление",
									ExpectedValue: "Наличие раздела в тексте", ActualValue: "Раздел не найден", Severity: "error",
									IsDoubtful:  true, // Always doubtful if it's a naming mismatch
									ContextText: text,
								})
							}
						}
					}
				}
			}
		}

		// --- Formatting Rules (Skip for Headings usually, but user might want strictness) ---
		// We usually apply "Body" rules only to normal paragraphs (no style or Normal)

		if !isHeading && shouldCheckBodyFormatting(p, inReferencesSection) {
			isCodeBlock := config.CodeBlocks.Enabled && isCodeParagraph(p)
			if isCodeBlock {
				codeViolations, codeRules := checkCodeParagraph(p, config.CodeBlocks, pos)
				violations = append(violations, codeViolations...)
				totalRules += codeRules
				continue
			}

			if p.IsListItem && config.Structure.ListAlignment != "" {
				totalRules++
				expected := normalizeAlignment(config.Structure.ListAlignment)
				actual := normalizeAlignment(p.Alignment)
				if actual == "" {
					actual = "left"
				}
				if actual != expected {
					violations = append(violations, models.Violation{
						RuleType:      "list_alignment",
						Description:   "Неверное выравнивание элемента списка",
						PositionInDoc: pos,
						ExpectedValue: expected,
						ActualValue:   actual,
						Severity:      "warning",
						ContextText:   p.Text,
						IsDoubtful:    true,
					})
				}
			}

			// --- Vocabulary Check (only for body text, not headings) ---
			if config.Scope.ForbiddenWords != "" {
				words := strings.Split(config.Scope.ForbiddenWords, ",")
				lowerText := strings.ToLower(p.Text)
				for _, w := range words {
					w = strings.TrimSpace(strings.ToLower(w))
					if w == "" {
						continue
					}
					// Use Unicode word-boundary matching: \P{L} matches any non-letter
					// character (space, punctuation, start/end of string). This prevents
					// "мы" from matching inside "мыться".
					// Pattern: (^|\P{L})word($|\P{L})
					escapedW := regexp.QuoteMeta(w)
					pattern := `(?i)(^|\P{L})` + escapedW + `($|\P{L})`
					re, err := regexp.Compile(pattern)
					if err == nil && re.MatchString(lowerText) {
						violations = append(violations, models.Violation{
							RuleType: "vocabulary", Description: fmt.Sprintf("Запрещённое слово: '%s'", w), PositionInDoc: pos,
							ExpectedValue: "Не должно быть", ActualValue: "Присутствует", Severity: "error",
							ContextText: p.Text,
						})
					}
				}
			}

			// Font Check
			if p.FontName != "" && config.Font.Name != "" {
				totalRules++
				if sameFont, isDoubtful := fontsEquivalent(p.FontName, config.Font.Name); !sameFont {
					severity := "error"
					if isDoubtful {
						severity = "warning"
					}
					violations = append(violations, models.Violation{
						RuleType: "font_name", Description: "Неверный шрифт", PositionInDoc: pos,
						ExpectedValue: config.Font.Name, ActualValue: p.FontName, Severity: severity,
						ContextText: p.Text,
						IsDoubtful:  isDoubtful,
					})
				}
			}
			if p.FontSizePt > 0 && config.Font.Size > 0 {
				totalRules++
				if math.Abs(p.FontSizePt-config.Font.Size) > 0.75 {
					isDoubtful := math.Abs(p.FontSizePt-config.Font.Size) <= 2.0
					severity := "error"
					if isDoubtful {
						severity = "warning"
					}
					violations = append(violations, models.Violation{
						RuleType: "font_size", Description: "Неверный размер шрифта", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f", config.Font.Size), ActualValue: fmt.Sprintf("%.1f", p.FontSizePt), Severity: severity,
						ContextText: p.Text,
						IsDoubtful:  isDoubtful,
					})
				}
			}

			// Spacing: skip if LineSpacing is 0 (means paragraph inherits from style, can't verify)
			if config.Paragraph.LineSpacing > 0 && p.LineSpacing > 0 {
				totalRules++
				// Allow a wider tolerance to account for Word's internal
				// rounding when storing line spacing in 240ths-of-line units.
				if math.Abs(p.LineSpacing-config.Paragraph.LineSpacing) > 0.2 {
					isDoubtful := math.Abs(p.LineSpacing-config.Paragraph.LineSpacing) <= 0.35
					violations = append(violations, models.Violation{
						RuleType: "line_spacing", Description: "Неверный междустрочный интервал", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.2f", config.Paragraph.LineSpacing), ActualValue: fmt.Sprintf("%.2f", p.LineSpacing), Severity: "warning",
						ContextText: p.Text,
						IsDoubtful:  isDoubtful,
					})
				}
			}

			// Justification — skip list items (they're naturally left-aligned)
			expectedAlign := config.Paragraph.Alignment
			if expectedAlign != "" && !p.IsListItem {
				totalRules++
				// Normalize expected
				normExpected := expectedAlign
				if normExpected == "justify" {
					normExpected = "both"
				}
				// Normalize actual (Word uses "start"/"end" for rtl/ltr)
				normActual := p.Alignment
				if normActual == "start" {
					normActual = "left"
				} else if normActual == "end" {
					normActual = "right"
				}
				// Empty alignment in para = default left
				if normActual == "" {
					normActual = "left"
				}
				if normActual != normExpected {
					readable := map[string]string{"both": "по ширине", "left": "слева", "center": "по центру", "right": "справа"}
					gotLabel := readable[normActual]
					if gotLabel == "" {
						gotLabel = normActual
					}
					wantLabel := readable[normExpected]
					if wantLabel == "" {
						wantLabel = normExpected
					}
					violations = append(violations, models.Violation{
						RuleType: "alignment", Description: "Неверное выравнивание", PositionInDoc: pos,
						ExpectedValue: wantLabel, ActualValue: gotLabel, Severity: "warning",
						ContextText: p.Text,
						IsDoubtful:  true, // Alignment is often semantic
					})
				}
			}

			// Indentation — skip list items (they use list indentation, not first-line indent)
			if config.Paragraph.FirstLineIndent > 0 && !p.IsListItem {
				totalRules++
				// Tolerance is intentionally broad: Word stores indent in twips and rounding can cause
				// small discrepancies (~1-2mm). Also students sometimes set 1.25cm vs 1.27cm.
				if math.Abs(p.FirstLineIndentMm-config.Paragraph.FirstLineIndent) > 4.0 {
					isDoubtful := math.Abs(p.FirstLineIndentMm-config.Paragraph.FirstLineIndent) <= 7.0
					violations = append(violations, models.Violation{
						RuleType: "indent", Description: "Неверный отступ первой строки", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f мм", config.Paragraph.FirstLineIndent), ActualValue: fmt.Sprintf("%.1f мм", p.FirstLineIndentMm), Severity: "warning",
						ContextText: p.Text,
						IsDoubtful:  isDoubtful,
					})
				}
			}

			// Advanced Typography Controls
			if config.Typography.ForbidBold {
				totalRules++
				if p.IsBold {
					violations = append(violations, models.Violation{
						RuleType: "style_bold", Description: "Жирный шрифт запрещен в основном тексте", PositionInDoc: pos,
						ExpectedValue: "Обычный", ActualValue: "Жирный", Severity: "error",
						ContextText: p.Text,
					})
				}
			}
			if config.Typography.ForbidItalic {
				totalRules++
				if p.IsItalic {
					violations = append(violations, models.Violation{
						RuleType: "style_italic", Description: "Курсив запрещен в основном тексте", PositionInDoc: pos,
						ExpectedValue: "Обычный", ActualValue: "Курсив", Severity: "error",
						ContextText: p.Text,
					})
				}
			}
			if config.Typography.ForbidUnderline {
				totalRules++
				if p.IsUnderline {
					violations = append(violations, models.Violation{
						RuleType: "style_underline", Description: "Подчеркивание запрещено", PositionInDoc: pos,
						ExpectedValue: "Обычный", ActualValue: "Подчеркнутый", Severity: "error",
						ContextText: p.Text,
					})
				}
			}
			if config.Typography.ForbidAllCaps {
				totalRules++
				if p.IsAllCaps {
					violations = append(violations, models.Violation{
						RuleType: "style_caps", Description: "ВСЕ ЗАГЛАВНЫЕ запрещены", PositionInDoc: pos,
						ExpectedValue: "Обычный", ActualValue: "ВСЕ ЗАГЛАВНЫЕ", Severity: "error",
						ContextText: p.Text,
					})
				}
			}
		}
	}

	// Check Doc Limits
	if config.Scope.MinPages > 0 && doc.Stats.TotalPages < config.Scope.MinPages {
		violations = append(violations, models.Violation{
			RuleType: "doc_length", Description: "Документ слишком короткий", PositionInDoc: "Глобально",
			ExpectedValue: fmt.Sprintf("Мин. %d стр.", config.Scope.MinPages), ActualValue: fmt.Sprintf("%d стр.", doc.Stats.TotalPages), Severity: "error",
		})
	}
	if config.Scope.MaxPages > 0 && doc.Stats.TotalPages > config.Scope.MaxPages {
		violations = append(violations, models.Violation{
			RuleType: "doc_length", Description: "Документ слишком длинный", PositionInDoc: "Глобально",
			ExpectedValue: fmt.Sprintf("Макс. %d стр.", config.Scope.MaxPages), ActualValue: fmt.Sprintf("%d стр.", doc.Stats.TotalPages), Severity: "error",
		})
	}

	// Check Introduction Pages
	if config.Introduction.MinPages > 0 || config.Introduction.MaxPages > 0 || config.Introduction.VerifyPageCountDeclaration {
		startPage := -1
		endPage := -1
		var introductionText strings.Builder // Collect all intro text for declaration check

		for _, p := range doc.Paragraphs {
			// Use isHeadingParagraph to also catch heuristic headings
			if isHeadingParagraph(p) {
				text := strings.ToLower(strings.TrimSpace(p.Text))
				if startPage == -1 && (strings.Contains(text, "введение") || strings.Contains(text, "introduction")) {
					startPage = p.PageNumber
				} else if startPage != -1 && endPage == -1 {
					endPage = p.PageNumber
					break
				}
			}

			// Collect intro text for declaration verification
			if startPage != -1 && endPage == -1 {
				introductionText.WriteString(p.Text)
				introductionText.WriteString(" ")
			}
		}

		// If endPage is not found but startPage is found, assume it goes to the end of document
		if startPage != -1 && endPage == -1 {
			endPage = doc.Stats.TotalPages
			// If total pages is the same as start page, we still count as 1
			if endPage < startPage {
				endPage = startPage
			}
		}

		if startPage != -1 {
			// Correct calculation: if intro starts at page 5 and next section at page 8,
			// intro occupies pages 5,6,7 = 3 pages (endPage - startPage)
			// But if intro is alone until end, we need +1
			pCount := endPage - startPage
			if pCount == 0 {
				pCount = 1
			}

			if config.Introduction.MinPages > 0 && pCount < config.Introduction.MinPages {
				violations = append(violations, models.Violation{
					RuleType: "intro_length", Description: "Введение слишком короткое", PositionInDoc: fmt.Sprintf("Стр. %d-%d", startPage, endPage),
					ExpectedValue: fmt.Sprintf("Мин. %d стр.", config.Introduction.MinPages), ActualValue: fmt.Sprintf("%d стр.", pCount), Severity: "error",
				})
			}
			if config.Introduction.MaxPages > 0 && pCount > config.Introduction.MaxPages {
				violations = append(violations, models.Violation{
					RuleType: "intro_length", Description: "Введение слишком длинное", PositionInDoc: fmt.Sprintf("Стр. %d-%d", startPage, endPage),
					ExpectedValue: fmt.Sprintf("Макс. %d стр.", config.Introduction.MaxPages), ActualValue: fmt.Sprintf("%d стр.", pCount), Severity: "error",
				})
			}

			// NEW: Verify page count declaration if enabled
			if config.Introduction.VerifyPageCountDeclaration {
				// Look for patterns like:
				// "Введение содержит 3 страницы"
				// "данный раздел занимает 2 страницы"
				// "Introduction spans 4 pages"
				introText := strings.ToLower(introductionText.String())

				// Regex patterns to find declared page counts
				// Russian: "содержит X страниц", "занимает X страниц"
				// English: "contains X pages", "spans X pages"
				patterns := []string{
					`содержит\s+(\d+)\s+страниц`,
					`занимает\s+(\d+)\s+страниц`,
					`содержит\s+(\d+)\s+стр`,
					`занимает\s+(\d+)\s+стр`,
					`contains\s+(\d+)\s+pages?`,
					`spans\s+(\d+)\s+pages?`,
				}

				declaredPages := -1

				for _, pattern := range patterns {
					re := regexp.MustCompile(pattern)
					matches := re.FindStringSubmatch(introText)
					if len(matches) > 1 {
						// Found a match, extract the number
						if num, err := strconv.Atoi(matches[1]); err == nil {
							declaredPages = num
							break
						}
					}
				}

				// If we found a declaration, verify it
				if declaredPages > 0 && declaredPages != pCount {
					violations = append(violations, models.Violation{
						RuleType:      "intro_page_declaration_mismatch",
						Description:   "Несовпадение заявленного и фактического количества страниц Введения",
						PositionInDoc: fmt.Sprintf("Введение (Стр. %d-%d)", startPage, endPage),
						ExpectedValue: fmt.Sprintf("Фактически: %d стр.", pCount),
						ActualValue:   fmt.Sprintf("Заявлено в тексте: %d стр.", declaredPages),
						Severity:      "warning", // Warning, not error, as declaration might be optional
						ContextText:   truncate(introductionText.String(), 200),
					})
				}
			}
		}
	}

	// Check Section Order
	if config.Structure.SectionOrder != "" {
		sectionViolations := checkSectionOrder(doc.Paragraphs, config.Structure.SectionOrder)
		violations = append(violations, sectionViolations...)
		for _, s := range strings.Split(config.Structure.SectionOrder, ",") {
			if strings.TrimSpace(s) != "" {
				totalRules++
			}
		}
	}

	score := 0.0
	passedRules := totalRules
	if totalRules > 0 {
		penalty := 0.0
		for _, v := range violations {
			penalty += violationPenalty(v)
		}
		if penalty > float64(totalRules) {
			penalty = float64(totalRules)
		}
		passedRules = totalRules - int(math.Ceil(penalty))
		if passedRules < 0 {
			passedRules = 0
		}
		score = math.Max(0, ((float64(totalRules)-penalty)/float64(totalRules))*100.0)
	}

	res := &models.CheckResult{
		OverallScore: score,
		TotalRules:   totalRules,
		FailedRules:  len(violations),
		PassedRules:  passedRules,
	}

	fmt.Printf("📊 Checker: TotalRules=%d, Violations=%d, PassedRules=%d, Score=%.2f\n", totalRules, len(violations), passedRules, score)

	// Serialize Content for View
	if contentBytes, err := json.Marshal(doc); err == nil {
		res.ContentJSON = string(contentBytes)
	}

	return res, violations, nil
}

// isHeadingStyle returns true if the Word style ID represents a heading, in any locale.
// Handles: English (Heading1), Russian (Заголовок1 / заголовок1),
// short numeric IDs used in Russian GOST templates (1, 2, 3 or 21, 22, 23).
func isHeadingStyle(styleID string) bool {
	if styleID == "" {
		return false
	}
	s := strings.ToLower(styleID)
	// English and common variants
	if strings.Contains(s, "heading") {
		return true
	}
	// Russian: "заголовок"
	if strings.Contains(s, "\u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a") {
		return true
	}
	// Numeric IDs: Word uses "1".."6" or "21".."26" for heading levels in Russian templates
	numericHeadings := map[string]bool{
		"1": true, "2": true, "3": true, "4": true, "5": true, "6": true,
		"21": true, "22": true, "23": true, "24": true, "25": true, "26": true,
	}
	return numericHeadings[styleID]
}

// isHeadingParagraph returns true if the paragraph is a heading either via explicit style
// or via heuristic detection (bold + large font + short line).
func isHeadingParagraph(p ParsedParagraph) bool {
	return isHeadingStyle(p.StyleID) || p.HeuristicHeading
}

// normalizeForTOC strips all whitespace and converts to lowercase to enable
// fuzzy comparison between TOC entries and actual headings (which may have
// different spacing, invisible characters, or different case).
func normalizeForTOC(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = tocNumberPrefixRegex.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\u200b", "")
	s = punctRegex.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

// headingLevelFromStyle extracts heading level (1-6) from a style ID, or 0 if not a heading.
func headingLevelFromStyle(styleID string) int {
	s := strings.ToLower(styleID)
	// Numeric Russian IDs: "1"=H1, "2"=H2 ... "21"=H1 (some templates use 20+level)
	numLevel := map[string]int{
		"1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
		"21": 1, "22": 2, "23": 3, "24": 4, "25": 5, "26": 6,
	}
	if lvl, ok := numLevel[styleID]; ok {
		return lvl
	}
	// English/Russian suffix: last char
	for lvl := 1; lvl <= 6; lvl++ {
		if strings.HasSuffix(s, fmt.Sprintf("%d", lvl)) {
			return lvl
		}
	}
	return 0
}

func checkMargins(actual Margins, target MarginsConfig) []models.Violation {
	vs := []models.Violation{}
	tol := target.Tolerance
	if tol == 0 {
		tol = 2.0
	} // Default 2mm tolerance

	addMarginViolation := func(ruleType, description string, expected, actualValue float64) {
		if expected <= 0 {
			return
		}
		diff := math.Abs(actualValue - expected)
		if diff <= tol {
			return
		}
		isDoubtful := diff <= tol*2
		severity := "error"
		if isDoubtful {
			severity = "warning"
		}
		vs = append(vs, models.Violation{
			RuleType: ruleType, Description: description, Severity: severity,
			ExpectedValue: fmt.Sprintf("%.1f мм", expected), ActualValue: fmt.Sprintf("%.1f мм", actualValue),
			IsDoubtful: isDoubtful,
		})
	}

	addMarginViolation("margin_top", "Неверный верхний отступ", target.Top, actual.TopMm)
	addMarginViolation("margin_bottom", "Неверный нижний отступ", target.Bottom, actual.BottomMm)
	addMarginViolation("margin_left", "Неверный левый отступ", target.Left, actual.LeftMm)
	addMarginViolation("margin_right", "Неверный правый отступ", target.Right, actual.RightMm)
	return vs
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func checkTables(tables []ParsedTable, paragraphs []ParsedParagraph, config TableConfig) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0

	// If no config fields are set at all, skip
	hasAnyConfig := config.Alignment != "" || config.RequireCaption || config.RequireBorders ||
		config.RequireHeaderRow || config.MaxWidthPct > 0 || config.CaptionDashFormat ||
		config.CheckCaptionLayout || config.CheckSequence || config.CheckTextReferences || config.MinRowHeightMm > 0
	if !hasAnyConfig {
		return vs, 0
	}

	captionKw := config.CaptionKeyword
	if captionKw == "" {
		captionKw = "Таблица"
	}

	for idx, t := range tables {
		pos := fmt.Sprintf("Таблица %d", idx+1)

		// 1. Alignment
		if config.Alignment != "" {
			rules++
			actual := t.Alignment
			if actual == "start" {
				actual = "left"
			} else if actual == "end" {
				actual = "right"
			}
			if actual != config.Alignment {
				vs = append(vs, models.Violation{
					RuleType:      "table_alignment",
					Description:   "Неверное выравнивание таблицы",
					PositionInDoc: pos,
					ExpectedValue: config.Alignment,
					ActualValue:   actual,
					Severity:      "warning",
				})
			}
		}

		// 2. Caption presence
		if config.RequireCaption {
			rules++
			if !t.HasCaption {
				vs = append(vs, models.Violation{
					RuleType:      "table_caption_missing",
					Description:   fmt.Sprintf("Таблица без подписи (должна начинаться с \"%s\")", captionKw),
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("%s N — Название", captionKw),
					ActualValue:   "Подпись отсутствует",
					Severity:      "warning",
				})
			}
		}

		// 2b. Caption keyword (if has caption)
		if t.HasCaption {
			rules++
			if !strings.Contains(strings.ToLower(t.CaptionText), strings.ToLower(captionKw)) {
				vs = append(vs, models.Violation{
					RuleType:      "table_caption_keyword",
					Description:   "Неверное ключевое слово в подписи таблицы",
					PositionInDoc: pos,
					ExpectedValue: captionKw,
					ActualValue:   truncate(t.CaptionText, 40),
					Severity:      "warning",
				})
			}
		}

		// 2c. Caption position (independent of RequireCaption — checked if caption exists)
		if t.HasCaption && config.CaptionPosition != "" && config.CaptionPosition != "none" {
			rules++
			wantAbove := config.CaptionPosition == "top"
			if wantAbove != t.CaptionAbove {
				wanted := "сверху"
				got := "снизу"
				if !wantAbove {
					wanted = "снизу"
					got = "сверху"
				}
				vs = append(vs, models.Violation{
					RuleType:      "table_caption_position",
					Description:   "Неверное расположение подписи таблицы",
					PositionInDoc: pos,
					ExpectedValue: wanted,
					ActualValue:   got,
					Severity:      "warning",
				})
			}
		}

		// 3. Borders
		if config.RequireBorders {
			rules++
			if !t.HasBorders {
				vs = append(vs, models.Violation{
					RuleType:      "table_borders_missing",
					Description:   "Таблица без внешних рамок",
					PositionInDoc: pos,
					ExpectedValue: "Рамки присутствуют",
					ActualValue:   "Рамки отсутствуют",
					Severity:      "warning",
				})
			}
		}

		// 4. Header row
		if config.RequireHeaderRow {
			rules++
			if !t.HasHeaderRow {
				vs = append(vs, models.Violation{
					RuleType:      "table_header_missing",
					Description:   "Таблица без строки заголовка",
					PositionInDoc: pos,
					ExpectedValue: "Строка заголовка присутствует",
					ActualValue:   "Строка заголовка отсутствует",
					Severity:      "warning",
				})
			}
		}

		// 5. Max width percent (only for pct type)
		if config.MaxWidthPct > 0 && t.WidthType == "pct" {
			rules++
			// width value in pct is stored as 50ths of percent in OOXML (5000 = 100%)
			actualPct := t.WidthValue / 50
			if actualPct > config.MaxWidthPct {
				vs = append(vs, models.Violation{
					RuleType:      "table_width",
					Description:   "Таблица шире допустимого",
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("%d%%", config.MaxWidthPct),
					ActualValue:   fmt.Sprintf("%d%%", actualPct),
					Severity:      "warning",
				})
			}
		}

		// 6. Caption dash format (ЕСКД 3.2.5: "Таблица N – Название")
		if config.CaptionDashFormat && t.HasCaption {
			rules++
			if !t.CaptionHasDash {
				vs = append(vs, models.Violation{
					RuleType:      "table_caption_dash",
					Description:   "В подписи отсутствует тире (ЕСКД: «Таблица N – Название»)",
					PositionInDoc: pos,
					ExpectedValue: "Таблица N – Название",
					ActualValue:   truncate(t.CaptionText, 40),
					Severity:      "warning",
				})
			}
		}

		if config.CheckCaptionLayout && t.HasCaption {
			if config.CaptionAlignment != "" {
				rules++
				actual := t.CaptionAlignment
				if actual == "" || actual == "start" {
					actual = "left"
				} else if actual == "end" {
					actual = "right"
				}
				expected := config.CaptionAlignment
				if expected == "justify" {
					expected = "both"
				}
				if actual != expected {
					vs = append(vs, models.Violation{
						RuleType:      "table_caption_alignment",
						Description:   "Неверное выравнивание подписи таблицы",
						PositionInDoc: pos,
						ExpectedValue: expected,
						ActualValue:   actual,
						Severity:      "warning",
						ContextText:   t.CaptionText,
						IsDoubtful:    true,
					})
				}
			}

			rules++
			if math.Abs(t.CaptionIndentMm-config.CaptionIndentMm) > 2.0 {
				vs = append(vs, models.Violation{
					RuleType:      "table_caption_indent",
					Description:   "Неверный отступ первой строки подписи таблицы",
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("%.1f мм", config.CaptionIndentMm),
					ActualValue:   fmt.Sprintf("%.1f мм", t.CaptionIndentMm),
					Severity:      "warning",
					ContextText:   t.CaptionText,
					IsDoubtful:    math.Abs(t.CaptionIndentMm-config.CaptionIndentMm) <= 4.0,
				})
			}

			if config.CaptionMaxSpacingPt >= 0 {
				rules++
				maxSpacing := config.CaptionMaxSpacingPt
				if t.CaptionBeforePt > maxSpacing || t.CaptionAfterPt > maxSpacing {
					vs = append(vs, models.Violation{
						RuleType:      "table_caption_spacing",
						Description:   "Лишние интервалы у подписи таблицы",
						PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("не больше %.1f pt до/после", maxSpacing),
						ActualValue:   fmt.Sprintf("%.1f pt до, %.1f pt после", t.CaptionBeforePt, t.CaptionAfterPt),
						Severity:      "warning",
						ContextText:   t.CaptionText,
						IsDoubtful:    true,
					})
				}
			}
		}

		// 7. Minimum row height (ЕСКД 3.2.5: высота строки ≥ 8 мм)
		if config.MinRowHeightMm > 0 {
			rules++
			// If no explicit height was set in the DOCX, treat as 0 (unknown = possibly too small)
			if t.MinRowHeightMm == 0 {
				// Heights not explicitly set — rows may be auto-sized (cannot verify)
				// Do nothing: we can only flag rows that are explicitly too small
			} else if t.MinRowHeightMm < config.MinRowHeightMm {
				vs = append(vs, models.Violation{
					RuleType:      "table_row_height",
					Description:   "Высота строки таблицы меньше допустимой",
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("≥ %.1f мм", config.MinRowHeightMm),
					ActualValue:   fmt.Sprintf("%.1f мм", t.MinRowHeightMm),
					Severity:      "warning",
				})
			}
		}
	}
	if config.CheckSequence {
		captionItems := captionNumbersFromParagraphs(paragraphs, "table_caption", tableCaptionNumberRe)
		if len(captionItems) == 0 {
			captionItems = tableCaptionNumbers(tables)
		}
		seqViolations, seqRules := checkObjectCaptionSequence("table", captionItems, config.NumberingMode)
		vs = append(vs, seqViolations...)
		rules += seqRules
	}
	if config.CheckTextReferences {
		captions := captionNumberSetFromParagraphs(paragraphs, "table_caption", tableCaptionNumberRe)
		if len(captions) == 0 {
			captions = tableCaptionNumberSet(tables)
		}
		refViolations, refRules := checkObjectTextReferences("table", captions, paragraphs, tableRefRegex)
		vs = append(vs, refViolations...)
		rules += refRules
	}
	return vs, rules
}

func checkImages(images []ParsedImage, paragraphs []ParsedParagraph, config ImageConfig) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0

	hasAnyConfig := config.Alignment != "" || config.RequireCaption || config.CaptionPosition != "" ||
		config.CaptionKeyword != "" || config.CaptionDashFormat || config.CheckCaptionLayout ||
		config.CheckSequence || config.CheckTextReferences
	if !hasAnyConfig {
		return vs, rules
	}

	keyword := strings.TrimSpace(config.CaptionKeyword)
	if keyword == "" {
		keyword = "Рисунок"
	}

	for i, img := range images {
		pos := fmt.Sprintf("Рисунок %d, страница %d", i+1, img.PageNumber)

		if config.Alignment != "" {
			rules++
			actual := normalizeAlignment(img.Alignment)
			expected := normalizeAlignment(config.Alignment)
			if actual == "" {
				actual = "left"
			}
			if actual != expected {
				vs = append(vs, models.Violation{
					RuleType:      "image_alignment",
					Description:   "Неверное выравнивание рисунка",
					PositionInDoc: pos,
					ExpectedValue: expected,
					ActualValue:   actual,
					Severity:      "warning",
					IsDoubtful:    true,
				})
			}
		}

		if config.RequireCaption {
			rules++
			if !img.HasCaption {
				vs = append(vs, models.Violation{
					RuleType:      "image_caption_missing",
					Description:   "У рисунка отсутствует подпись",
					PositionInDoc: pos,
					ExpectedValue: keyword,
					ActualValue:   "Подпись не найдена рядом с рисунком",
					Severity:      "warning",
					IsDoubtful:    true,
				})
			}
		}

		if img.HasCaption && keyword != "" {
			rules++
			if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(img.CaptionText)), strings.ToLower(keyword)) {
				vs = append(vs, models.Violation{
					RuleType:      "image_caption_keyword",
					Description:   "Подпись рисунка начинается не с ожидаемого слова",
					PositionInDoc: pos,
					ExpectedValue: keyword,
					ActualValue:   truncate(img.CaptionText, 50),
					Severity:      "warning",
					ContextText:   img.CaptionText,
					IsDoubtful:    true,
				})
			}
		}

		if img.HasCaption && config.CaptionPosition != "" && config.CaptionPosition != "none" {
			rules++
			expectedBelow := config.CaptionPosition == "bottom"
			if img.CaptionBelow != expectedBelow {
				expected := "снизу"
				actual := "сверху"
				if !expectedBelow {
					expected = "сверху"
					actual = "снизу"
				}
				vs = append(vs, models.Violation{
					RuleType:      "image_caption_position",
					Description:   "Неверное положение подписи рисунка",
					PositionInDoc: pos,
					ExpectedValue: expected,
					ActualValue:   actual,
					Severity:      "warning",
					ContextText:   img.CaptionText,
				})
			}
		}

		if img.HasCaption && config.CaptionDashFormat {
			rules++
			if !img.CaptionHasDash {
				vs = append(vs, models.Violation{
					RuleType:      "image_caption_dash",
					Description:   "В подписи рисунка отсутствует тире",
					PositionInDoc: pos,
					ExpectedValue: "Рисунок N – Название",
					ActualValue:   truncate(img.CaptionText, 50),
					Severity:      "warning",
					ContextText:   img.CaptionText,
				})
			}
		}

		if img.HasCaption && config.CheckCaptionLayout {
			if config.CaptionAlignment != "" {
				rules++
				actual := normalizeAlignment(img.CaptionAlignment)
				if actual == "" {
					actual = "left"
				}
				expected := normalizeAlignment(config.CaptionAlignment)
				if actual != expected {
					vs = append(vs, models.Violation{
						RuleType:      "image_caption_alignment",
						Description:   "Неверное выравнивание подписи рисунка",
						PositionInDoc: pos,
						ExpectedValue: expected,
						ActualValue:   actual,
						Severity:      "warning",
						ContextText:   img.CaptionText,
						IsDoubtful:    true,
					})
				}
			}

			rules++
			if math.Abs(img.CaptionIndentMm-config.CaptionIndentMm) > 2.0 {
				vs = append(vs, models.Violation{
					RuleType:      "image_caption_indent",
					Description:   "Неверный отступ первой строки подписи рисунка",
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("%.1f мм", config.CaptionIndentMm),
					ActualValue:   fmt.Sprintf("%.1f мм", img.CaptionIndentMm),
					Severity:      "warning",
					ContextText:   img.CaptionText,
					IsDoubtful:    math.Abs(img.CaptionIndentMm-config.CaptionIndentMm) <= 4.0,
				})
			}

			if config.CaptionMaxSpacingPt >= 0 {
				rules++
				if img.CaptionBeforePt > config.CaptionMaxSpacingPt || img.CaptionAfterPt > config.CaptionMaxSpacingPt {
					vs = append(vs, models.Violation{
						RuleType:      "image_caption_spacing",
						Description:   "Лишние интервалы у подписи рисунка",
						PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("не больше %.1f pt до/после", config.CaptionMaxSpacingPt),
						ActualValue:   fmt.Sprintf("%.1f pt до, %.1f pt после", img.CaptionBeforePt, img.CaptionAfterPt),
						Severity:      "warning",
						ContextText:   img.CaptionText,
						IsDoubtful:    true,
					})
				}
			}
		}
	}
	if config.CheckSequence {
		captionItems := captionNumbersFromParagraphs(paragraphs, "figure_caption", figureCaptionNumberRe)
		if len(captionItems) == 0 {
			captionItems = imageCaptionNumbers(images)
		}
		seqViolations, seqRules := checkObjectCaptionSequence("image", captionItems, config.NumberingMode)
		vs = append(vs, seqViolations...)
		rules += seqRules
	}
	if config.CheckTextReferences {
		captions := captionNumberSetFromParagraphs(paragraphs, "figure_caption", figureCaptionNumberRe)
		if len(captions) == 0 {
			captions = imageCaptionNumberSet(images)
		}
		refViolations, refRules := checkObjectTextReferences("image", captions, paragraphs, figureRefRegex)
		vs = append(vs, refViolations...)
		rules += refRules
	}

	return vs, rules
}

type objectCaptionNumber struct {
	Number  string
	Text    string
	Ordinal int
	Page    int
}

func tableCaptionNumbers(tables []ParsedTable) []objectCaptionNumber {
	items := []objectCaptionNumber{}
	for i, t := range tables {
		if t.HasCaption {
			items = append(items, objectCaptionNumber{Number: normalizeObjectNumber(t.CaptionNumber), Text: t.CaptionText, Ordinal: i + 1})
		}
	}
	return items
}

func imageCaptionNumbers(images []ParsedImage) []objectCaptionNumber {
	items := []objectCaptionNumber{}
	for i, img := range images {
		if img.HasCaption {
			items = append(items, objectCaptionNumber{Number: normalizeObjectNumber(img.CaptionNumber), Text: img.CaptionText, Ordinal: i + 1, Page: img.PageNumber})
		}
	}
	return items
}

func tableCaptionNumberSet(tables []ParsedTable) map[string]bool {
	set := map[string]bool{}
	for _, t := range tables {
		if t.HasCaption && t.CaptionNumber != "" {
			set[normalizeObjectNumber(t.CaptionNumber)] = true
		}
	}
	return set
}

func imageCaptionNumberSet(images []ParsedImage) map[string]bool {
	set := map[string]bool{}
	for _, img := range images {
		if img.HasCaption && img.CaptionNumber != "" {
			set[normalizeObjectNumber(img.CaptionNumber)] = true
		}
	}
	return set
}

func captionNumbersFromParagraphs(paragraphs []ParsedParagraph, role string, re *regexp.Regexp) []objectCaptionNumber {
	items := []objectCaptionNumber{}
	for _, p := range paragraphs {
		if p.Role != role {
			continue
		}
		text := strings.TrimSpace(p.Text)
		if text == "" {
			continue
		}
		items = append(items, objectCaptionNumber{
			Number:  normalizeObjectNumber(extractCaptionNumber(text, re)),
			Text:    text,
			Ordinal: len(items) + 1,
			Page:    p.PageNumber,
		})
	}
	return items
}

func captionNumberSetFromParagraphs(paragraphs []ParsedParagraph, role string, re *regexp.Regexp) map[string]bool {
	set := map[string]bool{}
	for _, p := range paragraphs {
		if p.Role != role {
			continue
		}
		number := normalizeObjectNumber(extractCaptionNumber(p.Text, re))
		if number != "" {
			set[number] = true
		}
	}
	return set
}

func normalizeObjectNumber(value string) string {
	value = strings.ReplaceAll(strings.TrimSpace(value), "-", ".")
	value = strings.Trim(value, ".")
	return value
}

func parseObjectNumber(value string) []int {
	value = normalizeObjectNumber(value)
	if value == "" {
		return nil
	}
	parts := strings.Split(value, ".")
	nums := make([]int, 0, len(parts))
	for _, part := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n <= 0 {
			return nil
		}
		nums = append(nums, n)
	}
	return nums
}

func inferNumberingMode(items []objectCaptionNumber, requested string) string {
	requested = strings.ToLower(strings.TrimSpace(requested))
	if requested == "plain" || requested == "section" {
		return requested
	}
	plain := 0
	section := 0
	for _, item := range items {
		parts := parseObjectNumber(item.Number)
		if len(parts) == 1 {
			plain++
		} else if len(parts) >= 2 {
			section++
		}
	}
	if section > 0 {
		return "section"
	}
	return "plain"
}

func checkObjectCaptionSequence(kind string, items []objectCaptionNumber, requestedMode string) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0
	if len(items) == 0 {
		return vs, rules
	}
	mode := inferNumberingMode(items, requestedMode)
	seen := map[string]int{}
	expectedPlain := 1
	expectedBySection := map[int]int{}

	for _, item := range items {
		rules++
		label := "таблицы"
		rulePrefix := "table"
		if kind == "image" {
			label = "рисунка"
			rulePrefix = "image"
		}
		position := captionViolationPosition(label, item)
		if item.Number == "" {
			vs = append(vs, models.Violation{
				RuleType:      rulePrefix + "_caption_number_missing",
				Description:   "Не удалось определить номер " + label + " из подписи",
				PositionInDoc: position,
				ExpectedValue: "Номер в подписи",
				ActualValue:   truncate(item.Text, 80),
				Severity:      "warning",
				ContextText:   item.Text,
				IsDoubtful:    true,
			})
			continue
		}
		if prev, ok := seen[item.Number]; ok {
			vs = append(vs, models.Violation{
				RuleType:      rulePrefix + "_caption_number_duplicate",
				Description:   "Повторяется номер " + label,
				PositionInDoc: position,
				ExpectedValue: "Уникальный номер",
				ActualValue:   fmt.Sprintf("%s уже был у объекта %d", item.Number, prev),
				Severity:      "error",
				ContextText:   item.Text,
			})
			continue
		}
		seen[item.Number] = item.Ordinal

		parts := parseObjectNumber(item.Number)
		if len(parts) == 0 {
			vs = append(vs, models.Violation{
				RuleType:      rulePrefix + "_caption_number_format",
				Description:   "Номер " + label + " записан в непонятном формате",
				PositionInDoc: position,
				ExpectedValue: "1, 2, 3 или 3.1, 3.2",
				ActualValue:   item.Number,
				Severity:      "warning",
				ContextText:   item.Text,
				IsDoubtful:    true,
			})
			continue
		}

		expected := ""
		if mode == "section" {
			if len(parts) < 2 {
				expected = fmt.Sprintf("номер по главе, например %d.1", parts[0])
			} else {
				section := parts[0]
				if _, ok := expectedBySection[section]; !ok {
					expectedBySection[section] = 1
				}
				expected = fmt.Sprintf("%d.%d", section, expectedBySection[section])
				if parts[1] == expectedBySection[section] {
					expectedBySection[section]++
					continue
				}
			}
		} else {
			expected = strconv.Itoa(expectedPlain)
			if len(parts) == 1 && parts[0] == expectedPlain {
				expectedPlain++
				continue
			}
		}

		if expected != "" && item.Number != expected {
			vs = append(vs, models.Violation{
				RuleType:      rulePrefix + "_caption_sequence",
				Description:   "Нарушена последовательность нумерации " + label,
				PositionInDoc: position,
				ExpectedValue: expected,
				ActualValue:   item.Number,
				Severity:      "warning",
				ContextText:   item.Text,
				IsDoubtful:    mode == "section",
			})
		}
		if mode == "plain" && len(parts) == 1 {
			expectedPlain = parts[0] + 1
		}
		if mode == "section" && len(parts) >= 2 {
			expectedBySection[parts[0]] = parts[1] + 1
		}
	}
	return vs, rules
}

func captionViolationPosition(label string, item objectCaptionNumber) string {
	if item.Page > 0 {
		return fmt.Sprintf("Page %d: %s...", item.Page, truncate(item.Text, 80))
	}
	return fmt.Sprintf("%s %d: %s...", label, item.Ordinal, truncate(item.Text, 80))
}

func checkObjectTextReferences(kind string, captions map[string]bool, paragraphs []ParsedParagraph, re *regexp.Regexp) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0
	rulePrefix := "table"
	label := "таблицу"
	if kind == "image" {
		rulePrefix = "image"
		label = "рисунок"
	}
	if len(captions) == 0 {
		return vs, rules
	}
	for i, p := range paragraphs {
		if p.Role == "toc" || p.Role == "table_caption" || p.Role == "figure_caption" || strings.TrimSpace(p.Text) == "" {
			continue
		}
		matches := re.FindAllStringSubmatch(strings.ReplaceAll(p.Text, "\u00a0", " "), -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			rules++
			number := normalizeObjectNumber(match[1])
			if !captions[number] {
				vs = append(vs, models.Violation{
					RuleType:      rulePrefix + "_text_reference_missing",
					Description:   "В тексте есть ссылка на " + label + ", но такой подписи не найдено",
					PositionInDoc: fmt.Sprintf("Page %d, Para %d: %s...", p.PageNumber, i+1, truncate(strings.TrimSpace(p.Text), 80)),
					ExpectedValue: "Существующая подпись " + number,
					ActualValue:   "Ссылка без найденной подписи",
					Severity:      "warning",
					ContextText:   p.Text,
					IsDoubtful:    true,
				})
			}
		}
	}
	return vs, rules
}

func checkFormulas(formulas []ParsedFormula, paragraphs []ParsedParagraph, config FormulaConfig) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0

	hasAnyConfig := config.Alignment != "" || config.RequireNumbering ||
		config.RequireSpacingAround || config.CheckWhereNoColon
	if !hasAnyConfig {
		return vs, 0
	}

	// Build a map from paragraph ID to index for fast neighbour lookup
	paraIndexByID := make(map[string]int, len(paragraphs))
	for i, p := range paragraphs {
		paraIndexByID[p.ID] = i
	}

	// isEmptyOrSpaced returns true if paragraph is blank or has explicit spacing
	isEmptyOrSpaced := func(p ParsedParagraph) bool {
		return strings.TrimSpace(p.Text) == "" || p.SpacingAfterPt >= 6 || p.SpacingBeforePt >= 6
	}

	for _, f := range formulas {
		pos := fmt.Sprintf("Формула %s", f.ID)

		// 1. Alignment
		if config.Alignment != "" {
			rules++
			actual := f.Alignment
			if actual == "centerGroup" {
				actual = "center"
			}
			expected := config.Alignment
			if expected == "group" {
				expected = "center"
			}
			if actual != expected && actual != "" {
				vs = append(vs, models.Violation{
					RuleType:      "formula_alignment",
					Description:   "Неверное выравнивание формулы",
					PositionInDoc: pos,
					ExpectedValue: config.Alignment,
					ActualValue:   actual,
					Severity:      "warning",
				})
			}
		}

		// 2. Numbering
		if config.RequireNumbering {
			rules++
			if !f.HasNumbering {
				numFmt := config.NumberingFormat
				if numFmt == "" {
					numFmt = "(1)"
				}
				numPos := config.NumberingPosition
				if numPos == "" {
					numPos = "right"
				}
				vs = append(vs, models.Violation{
					RuleType:      "formula_numbering_missing",
					Description:   fmt.Sprintf("Формула не пронумерована (ожидается %s %s)", numFmt, numPos),
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("Номер вида %s (%s)", numFmt, numPos),
					ActualValue:   "Нумерация отсутствует",
					Severity:      "warning",
				})
			}
		}

		// 3. Spacing around formula (empty line before and after)
		if config.RequireSpacingAround {
			rules++
			wrapperIdx, found := paraIndexByID[f.WrapperID]
			if found {
				wrapper := paragraphs[wrapperIdx]
				hasBefore := wrapper.SpacingBeforePt >= 3 || (wrapperIdx > 0 && isEmptyOrSpaced(paragraphs[wrapperIdx-1]))
				hasAfter := wrapper.SpacingAfterPt >= 3 || (wrapperIdx < len(paragraphs)-1 && isEmptyOrSpaced(paragraphs[wrapperIdx+1]))
				if !hasBefore || !hasAfter {
					missing := []string{}
					if !hasBefore {
						missing = append(missing, "до")
					}
					if !hasAfter {
						missing = append(missing, "после")
					}
					vs = append(vs, models.Violation{
						RuleType:      "formula_spacing",
						Description:   fmt.Sprintf("Отсутствует пустая строка %s формулы", strings.Join(missing, " и ")),
						PositionInDoc: pos,
						ExpectedValue: "Пустая строка до и после",
						ActualValue:   "Отсутствует",
						Severity:      "warning",
					})
				}
			}
		}

		// 4. «где» without colon check
		if config.CheckWhereNoColon {
			rules++
			wrapperIdx, found := paraIndexByID[f.WrapperID]
			if found {
				// Find next non-empty paragraph after formula
				for j := wrapperIdx + 1; j < len(paragraphs); j++ {
					nextText := strings.TrimSpace(paragraphs[j].Text)
					if nextText == "" {
						continue
					}
					lowerNext := strings.ToLower(nextText)
					if strings.HasPrefix(lowerNext, "где") {
						// Check for colon immediately after "где"
						// Patterns: "где:" "где :" "где,коэффициент:" etc.
						whereColonRe := regexp.MustCompile(`(?i)^где\s*:`)
						if whereColonRe.MatchString(nextText) {
							vs = append(vs, models.Violation{
								RuleType:      "formula_where_colon",
								Description:   "После «где» не должно быть двоеточия (ГОСТ: «где» без двоеточия)",
								PositionInDoc: pos,
								ExpectedValue: "где символ — значение",
								ActualValue:   truncate(nextText, 60),
								Severity:      "warning",
							})
						}
					}
					break // Only check the first non-empty paragraph after formula
				}
			}
		}
	}
	return vs, rules
}

// checkSectionOrder verifies that document headings appear in the expected order.
// Expected sections are comma-separated, case-insensitive, and matched against heading
// text with leading numeric prefixes stripped (e.g. "1.", "1.1.", "I.") so users don't
// have to include numbering in the config.
func checkSectionOrder(paragraphs []ParsedParagraph, expectedOrder string) []models.Violation {
	vs := []models.Violation{}
	if expectedOrder == "" {
		return vs
	}

	// Parse expected sections into ordered list
	expectedSections := []string{}
	for _, s := range strings.Split(expectedOrder, ",") {
		s = strings.TrimSpace(strings.ToLower(s))
		if s != "" {
			expectedSections = append(expectedSections, s)
		}
	}
	if len(expectedSections) == 0 {
		return vs
	}

	// numPrefixRe strips leading numbering like "1.", "1.1.", "1.1", "1.1.1", "I.", "А."
	// It handles trailing dots and trailing spaces.
	numPrefixRe := regexp.MustCompile(`^[\d\p{L}]+(?:\.[\d\p{L}]+)*\.?\s+`)

	// Collect heading candidates:
	// - Paragraphs with an explicit heading style
	// - Paragraphs detected by heuristic (bold+large+short)
	// - Short paragraphs (≤200 chars) with no trailing punctuation that ends a sentence
	headingTexts := []string{}
	for _, p := range paragraphs {
		t := strings.TrimSpace(p.Text)
		if t == "" {
			continue
		}

		isCandidate := isHeadingParagraph(p)
		if !isCandidate {
			// Fallback for docs with no styles: short lines without sentence-ending punctuation
			noSentenceEnd := !strings.HasSuffix(t, ".") && !strings.HasSuffix(t, ";") && !strings.HasSuffix(t, ",")
			isCandidate = len([]rune(t)) <= 200 && noSentenceEnd
		}

		if isCandidate {
			// Strip leading numeric prefix before storing for matching
			stripped := numPrefixRe.ReplaceAllString(strings.ToLower(t), "")
			stripped = strings.TrimSpace(stripped)
			if stripped == "" {
				stripped = strings.ToLower(t)
			}
			headingTexts = append(headingTexts, stripped)
		}
	}

	// matchesSection returns true if a heading text contains the expected section keyword.
	// We use normalizeForTOC to strip ALL punctuation, quotes, and normalize whitespace
	// from BOTH strings before comparing them. This makes the match extremely robust.
	matchesSection := func(heading, section string) bool {
		// Strip prefixes from the user input too, just in case they typed "1. Введение"
		cleanSection := numPrefixRe.ReplaceAllString(strings.ToLower(section), "")

		normHeading := normalizeForTOC(heading)
		normSection := normalizeForTOC(cleanSection)

		if normSection == "" {
			return false
		}

		return strings.Contains(normHeading, normSection)
	}

	// Match expected sections in order against actual headings
	expectedIdx := 0
	for _, heading := range headingTexts {
		if expectedIdx >= len(expectedSections) {
			break
		}
		if matchesSection(heading, expectedSections[expectedIdx]) {
			expectedIdx++
		}
	}

	// If we didn't reach the end, report missing or out-of-order sections
	if expectedIdx < len(expectedSections) {
		for i := expectedIdx; i < len(expectedSections); i++ {
			// Check if the section actually exists anywhere in the document (out-of-order vs missing)
			found := false
			for _, heading := range headingTexts {
				if matchesSection(heading, expectedSections[i]) {
					found = true
					break
				}
			}
			if found {
				vs = append(vs, models.Violation{
					RuleType:      "section_order",
					Description:   fmt.Sprintf("Нарушен порядок разделов: «%s» стоит не на своём месте", expectedSections[i]),
					PositionInDoc: "Структура документа",
					ExpectedValue: fmt.Sprintf("Позиция %d в порядке: %s", i+1, strings.Join(expectedSections, " → ")),
					ActualValue:   "Раздел найден, но порядок нарушен",
					Severity:      "error",
				})
			} else {
				vs = append(vs, models.Violation{
					RuleType:      "section_missing",
					Description:   fmt.Sprintf("Отсутствует обязательный раздел: «%s»", expectedSections[i]),
					PositionInDoc: "Структура документа",
					ExpectedValue: strings.Join(expectedSections, " → "),
					ActualValue:   "Раздел не найден",
					Severity:      "error",
				})
			}
		}
	}

	return vs
}

func checkReferences(paragraphs []ParsedParagraph, cfg ReferencesConfig) ([]models.Violation, int) {
	violations := []models.Violation{}
	rules := 0

	found := false
	for _, p := range paragraphs {
		if isReferenceHeading(p.Text, cfg) {
			found = true
			break
		}
	}

	if cfg.Required {
		rules++
		if !found {
			keyword := strings.TrimSpace(cfg.TitleKeyword)
			if keyword == "" {
				keyword = "Список используемой литературы"
			}
			violations = append(violations, models.Violation{
				RuleType:      "references_missing",
				Description:   "Не найден раздел библиографии",
				PositionInDoc: "Библиография",
				ExpectedValue: keyword,
				ActualValue:   "Раздел не найден",
				Severity:      "error",
				IsDoubtful:    true,
			})
		}
	}

	if cfg.CheckSourceAge && found {
		ageViolations, ageRules := checkReferencesAge(paragraphs, cfg)
		violations = append(violations, ageViolations...)
		rules += ageRules
	}

	return violations, rules
}

// checkReferencesAge scans the bibliography section and flags sources whose year is too old.
// It finds the bibliography heading (title_keyword), then scans following paragraphs
// for 4-digit years. Any year older than maxAge years from current year is flagged.
func checkReferencesAge(paragraphs []ParsedParagraph, cfg ReferencesConfig) ([]models.Violation, int) {
	var vs []models.Violation
	rules := 0

	keyword := cfg.TitleKeyword
	if keyword == "" {
		keyword = "\u0421\u043f\u0438\u0441\u043e\u043a \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u044b"
	}
	maxAge := cfg.MaxSourceAgeYears
	if maxAge <= 0 {
		maxAge = 5
	}
	currentYear := time.Now().Year()
	oldestAllowed := currentYear - maxAge

	// 4-digit year pattern (1900-2099)
	yearRe := regexp.MustCompile(`\b(19\d{2}|20\d{2})\b`)

	inRefSection := false
	for i, p := range paragraphs {
		text := strings.TrimSpace(p.Text)
		if text == "" {
			continue
		}

		// Detect start of bibliography section: short line containing the keyword
		// (no isHeadingParagraph requirement — students often use plain bold, not H1)
		lowerText := strings.ToLower(text)
		lowerKW := strings.ToLower(keyword)
		if strings.Contains(lowerText, lowerKW) && len([]rune(text)) <= 120 {
			inRefSection = true
			continue
		}

		// Stop at the next heading of equal or higher level after the bibliography
		if inRefSection && isHeadingParagraph(p) {
			break
		}

		if !inRefSection {
			continue
		}

		// Check any paragraph in the ref section that contains a year
		// (numbered entries like "1. ..." as well as entries with URLs etc.)
		// Find all years in this entry
		matches := yearRe.FindAllString(text, -1)
		rules++
		for _, yearStr := range matches {
			year, err := strconv.Atoi(yearStr)
			if err != nil {
				continue
			}
			if year < oldestAllowed {
				pos := fmt.Sprintf("Page %d, Para %d: %s...", p.PageNumber, i+1, truncate(text, 80))
				lowerEntry := strings.ToLower(text)
				isStableSource := strings.Contains(lowerEntry, "гост") || strings.Contains(lowerEntry, "iso") ||
					strings.Contains(lowerEntry, "закон") || strings.Contains(lowerEntry, "кодекс") ||
					strings.Contains(lowerEntry, "конституц") || strings.Contains(lowerEntry, "стандарт")
				vs = append(vs, models.Violation{
					RuleType:      "reference_age",
					Description:   fmt.Sprintf("\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0443\u0441\u0442\u0430\u0440\u0435\u043b (%d \u0433.): \u0441\u0442\u0430\u0440\u0448\u0435 %d \u043b\u0435\u0442 \u043e\u0442 %d", year, maxAge, currentYear),
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("\u041d\u0435 \u0440\u0430\u043d\u044c\u0448\u0435 %d \u0433\u043e\u0434\u0430", oldestAllowed),
					ActualValue:   fmt.Sprintf("%d \u0433\u043e\u0434", year),
					Severity:      "warning",
					ContextText:   truncate(text, 150),
					IsDoubtful:    isStableSource,
				})
				break // one violation per reference entry
			}
		}
	}

	return vs, rules
}

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

// ConfigSchema defines what the frontend Standard JSON should look like
type ConfigSchema struct {
	Margins      MarginsConfig      `json:"margins"`
	Font         FontConfig         `json:"font"`
	Paragraph    ParagraphConfig    `json:"paragraph"`
	PageSetup    PageSetupConfig    `json:"page_setup"`
	HeaderFooter HeaderFooterConfig `json:"header_footer"` // New
	Typography   TypographyConfig   `json:"typography"`
	Structure    StructureConfig    `json:"structure"`
	Scope        ScopeConfig        `json:"scope"`        // New
	Introduction IntroductionConfig `json:"introduction"` // New
	Tables       TableConfig        `json:"tables"`       // New
	Formulas     FormulaConfig      `json:"formulas"`     // New
}

type TableConfig struct {
	CaptionPosition   string  `json:"caption_position"`    // top, bottom, none
	Alignment         string  `json:"alignment"`           // left, center, right
	RequireCaption    bool    `json:"require_caption"`     // must have a caption
	CaptionKeyword    string  `json:"caption_keyword"`     // default "Таблица"
	CaptionDashFormat bool    `json:"caption_dash_format"` // caption must contain em-dash (ЕСКД)
	RequireBorders    bool    `json:"require_borders"`     // table must have outer borders
	RequireHeaderRow  bool    `json:"require_header_row"`  // first row must be header
	MinRowHeightMm    float64 `json:"min_row_height_mm"`   // 0 = ignore; ESKD = 8.0
	MaxWidthPct       int     `json:"max_width_pct"`       // 0 = ignore
}

type FormulaConfig struct {
	Alignment         string `json:"alignment"`          // left, center, right
	RequireNumbering  bool   `json:"require_numbering"`  // must have (N) label
	NumberingPosition string `json:"numbering_position"` // right, left
	NumberingFormat   string `json:"numbering_format"`   // "(1)", "(1.1)"
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

type StructureConfig struct {
	Heading1StartNewPage bool   `json:"heading_1_start_new_page"`
	HeadingHierarchy     bool   `json:"heading_hierarchy"`
	ListAlignment        string `json:"list_alignment"`
	VerifyTOC            bool   `json:"verify_toc"` // New: Check TOC page numbers
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
	totalRules += 4
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
	tblViolations, tblRules := checkTables(doc.Tables, config.Tables)
	violations = append(violations, tblViolations...)
	totalRules += tblRules

	// Check Formulas
	fmViolations, fmRules := checkFormulas(doc.Formulas, config.Formulas)
	violations = append(violations, fmViolations...)
	totalRules += fmRules

	if ctx.Err() != nil {
		return nil, nil, ctx.Err()
	}

	// Check Paragraphs
	lastHeadingLevel := 0
	for i, p := range doc.Paragraphs {
		if strings.TrimSpace(p.Text) == "" {
			continue
		}

		// Page Scope Filter
		if config.Scope.StartPage > 1 && p.PageNumber < config.Scope.StartPage {
			// Skip checks for this paragraph as it is out of scope (e.g. title page)
			continue
		}

		// ID for Violation
		pos := fmt.Sprintf("Page %d, Para %d: %s...", p.PageNumber, i+1, truncate(p.Text, 100))

		isHeading := false
		headingLevel := 0
		if p.StyleID != "" && strings.Contains(strings.ToLower(p.StyleID), "heading") {
			isHeading = true
			if strings.Contains(p.StyleID, "1") {
				headingLevel = 1
			}
			if strings.Contains(p.StyleID, "2") {
				headingLevel = 2
			}
			if strings.Contains(p.StyleID, "3") {
				headingLevel = 3
			}
		}

		// Vocabulary Check will be done inside !isHeading block below

		// --- Structure Rules ---

		// 1. Heading 1 starts new page
		if config.Structure.Heading1StartNewPage && headingLevel == 1 {
			// Check if this Para has a page break, OR if the PREVIOUS para ending had one (simplified: we just check current para 'StartsPageBreak' flag from Parser)
			// Actually reliable detection needs to check previous run's break or this para's "pageBreakBefore" property (not yet fully parsed, but let's use what we have: Runs with Br)
			// Our parser flags 'StartsPageBreak' if it finds <w:br type="page"> in the runs.
			// Often "Page Break Before" is a PPr property <w:pageBreakBefore/>. We didn't parse that yet.
			// Let's rely on explicit Breaks for now.
			if i > 0 && !p.StartsPageBreak {
				// Also check if previous paragraph had a break at the end?
				// Simplified: Warn if no break found.
				violations = append(violations, models.Violation{
					RuleType: "structure_break", Description: "Заголовок 1 уровня должен начинаться с новой страницы", PositionInDoc: pos,
					ExpectedValue: "Разрыв страницы", ActualValue: "Сплошной текст", Severity: "warning", // Warning because our detection is partial
				})
			}
		}

		// 2. Heading Hierarchy (1 -> 2 -> 3)
		if config.Structure.HeadingHierarchy && isHeading && headingLevel > 0 {
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
		if config.Structure.VerifyTOC && (strings.HasPrefix(strings.ToLower(p.StyleID), "toc") || strings.HasPrefix(strings.ToLower(p.StyleID), "table of contents")) {
			// Parse TOC Entry with improved regex support
			// Formats supported:
			// "Some Title ...... 5"
			// "Some Title    .    .    .    7"
			// "Some Title		10"  (tabs)
			// "1. Chapter Title ......... 12"
			text := strings.TrimSpace(p.Text)

			// Skip empty or very short TOC entries
			if len(text) < 3 {
				continue
			}

			// Enhanced regex pattern to extract title and page number
			// Matches: "Title [dots/spaces/tabs] PageNumber"
			// Captures: 1=title, 2=page number
			tocPattern := `^(.+?)[\s\.\_\-]+(\d+)$`
			re := regexp.MustCompile(tocPattern)
			matches := re.FindStringSubmatch(text)

			if len(matches) >= 3 {
				titlePart := strings.TrimSpace(matches[1])
				pagePart := matches[2]

				// Clean up title: remove trailing dots, underscores, dashes, spaces
				titlePart = strings.TrimRight(titlePart, " ._-")

				if tocPage, err := strconv.Atoi(pagePart); err == nil {
					// Found a valid TOC entry structure. Now find the heading.
					// Search whole doc for this heading
					// Build a map of headings for O(1) lookup (optimization)
					if len(doc.Paragraphs) > 100 {
						// For large docs, use map
						headingMap := make(map[string]int)
						for _, targetP := range doc.Paragraphs {
							if targetP.StyleID != "" && strings.Contains(strings.ToLower(targetP.StyleID), "heading") {
								normalizedTitle := strings.ToLower(strings.TrimSpace(targetP.Text))
								headingMap[normalizedTitle] = targetP.PageNumber
							}
						}

						normalizedSearchTitle := strings.ToLower(titlePart)
						if actualPage, found := headingMap[normalizedSearchTitle]; found {
							if actualPage != tocPage {
								violations = append(violations, models.Violation{
									RuleType: "toc_page_mismatch", Description: fmt.Sprintf("Несовпадение страниц в оглавлении для '%s'", truncate(titlePart, 20)), PositionInDoc: "Оглавление",
									ExpectedValue: fmt.Sprintf("Стр. %d", actualPage), ActualValue: fmt.Sprintf("Стр. %d", tocPage), Severity: "error",
								})
							}
						}
					} else {
						// For small docs, linear search is fine
						for _, targetP := range doc.Paragraphs {
							if targetP.StyleID != "" && strings.Contains(strings.ToLower(targetP.StyleID), "heading") {
								// Compare Text with case-insensitive trim
								if strings.EqualFold(strings.TrimSpace(targetP.Text), titlePart) {
									if targetP.PageNumber != tocPage {
										violations = append(violations, models.Violation{
											RuleType: "toc_page_mismatch", Description: fmt.Sprintf("Несовпадение страниц в оглавлении для '%s'", truncate(titlePart, 20)), PositionInDoc: "Оглавление",
											ExpectedValue: fmt.Sprintf("Стр. %d", targetP.PageNumber), ActualValue: fmt.Sprintf("Стр. %d", tocPage), Severity: "error",
										})
									}
									break
								}
							}
						}
						// Note: We don't warn if heading not found to avoid false positives
					}
				}
			}
		}

		// --- Formatting Rules (Skip for Headings usually, but user might want strictness) ---
		// We usually apply "Body" rules only to normal paragraphs (no style or Normal)

		if !isHeading {
			// --- Vocabulary Check (only for body text, not headings) ---
			if config.Scope.ForbiddenWords != "" {
				words := strings.Split(config.Scope.ForbiddenWords, ",")
				lowerText := strings.ToLower(p.Text)
				for _, w := range words {
					w = strings.TrimSpace(strings.ToLower(w))
					if w != "" && strings.Contains(lowerText, w) {
						violations = append(violations, models.Violation{
							RuleType: "vocabulary", Description: fmt.Sprintf("Запрещенная фраза: '%s'", w), PositionInDoc: pos,
							ExpectedValue: "Не должно быть", ActualValue: "Присутствует", Severity: "error",
							ContextText: p.Text,
						})
					}
				}
			}

			// Font Check
			if p.FontName != "" && config.Font.Name != "" {
				totalRules++
				if p.FontName != config.Font.Name {
					violations = append(violations, models.Violation{
						RuleType: "font_name", Description: "Неверный шрифт", PositionInDoc: pos,
						ExpectedValue: config.Font.Name, ActualValue: p.FontName, Severity: "error",
						ContextText: p.Text,
					})
				}
			}
			if p.FontSizePt > 0 && config.Font.Size > 0 {
				totalRules++
				if math.Abs(p.FontSizePt-config.Font.Size) > 0.5 {
					violations = append(violations, models.Violation{
						RuleType: "font_size", Description: "Неверный размер шрифта", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f", config.Font.Size), ActualValue: fmt.Sprintf("%.1f", p.FontSizePt), Severity: "error",
						ContextText: p.Text,
					})
				}
			}

			// Spacing
			if config.Paragraph.LineSpacing > 0 {
				totalRules++
				if math.Abs(p.LineSpacing-config.Paragraph.LineSpacing) > 0.1 {
					violations = append(violations, models.Violation{
						RuleType: "line_spacing", Description: "Неверный междустрочный интервал", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f", config.Paragraph.LineSpacing), ActualValue: fmt.Sprintf("%.1f", p.LineSpacing), Severity: "warning",
						ContextText: p.Text,
					})
				}
			}

			// Justification
			expectedAlign := config.Paragraph.Alignment
			if expectedAlign != "" {
				totalRules++
				if expectedAlign == "justify" && p.Alignment != "both" {
					violations = append(violations, models.Violation{
						RuleType: "alignment", Description: "Неверное выравнивание", PositionInDoc: pos,
						ExpectedValue: "по ширине", ActualValue: p.Alignment, Severity: "warning",
						ContextText: p.Text,
					})
				}
			}

			// Indentation
			if config.Paragraph.FirstLineIndent > 0 {
				totalRules++
				if math.Abs(p.FirstLineIndentMm-config.Paragraph.FirstLineIndent) > 2.0 {
					violations = append(violations, models.Violation{
						RuleType: "indent", Description: "Неверный отступ первой строки", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f", config.Paragraph.FirstLineIndent), ActualValue: fmt.Sprintf("%.1f", p.FirstLineIndentMm), Severity: "warning",
						ContextText: p.Text,
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
			if p.StyleID != "" && strings.Contains(strings.ToLower(p.StyleID), "heading") {
				// Simple heuristic for Introduction heading
				text := strings.ToLower(strings.TrimSpace(p.Text))
				if startPage == -1 && (strings.Contains(text, "введение") || strings.Contains(text, "introduction")) {
					startPage = p.PageNumber
				} else if startPage != -1 && endPage == -1 {
					// Next heading marks the end
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

	// Calculate Score
	// Proper formula: score = (passed / total) * 100
	passedRules := totalRules - len(violations)
	if passedRules < 0 {
		passedRules = 0
	}

	score := 0.0
	if totalRules > 0 {
		score = math.Max(0, (float64(passedRules)/float64(totalRules))*100.0)
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

func checkMargins(actual Margins, target MarginsConfig) []models.Violation {
	vs := []models.Violation{}
	tol := target.Tolerance
	if tol == 0 {
		tol = 2.0
	} // Default 2mm tolerance

	if math.Abs(actual.TopMm-target.Top) > tol {
		vs = append(vs, models.Violation{RuleType: "margin_top", Description: "Неверный верхний отступ", Severity: "error", ExpectedValue: fmt.Sprintf("%.1f мм", target.Top), ActualValue: fmt.Sprintf("%.1f мм", actual.TopMm)})
	}
	if math.Abs(actual.BottomMm-target.Bottom) > tol {
		vs = append(vs, models.Violation{RuleType: "margin_bottom", Description: "Неверный нижний отступ", Severity: "error", ExpectedValue: fmt.Sprintf("%.1f мм", target.Bottom), ActualValue: fmt.Sprintf("%.1f мм", actual.BottomMm)})
	}
	if math.Abs(actual.LeftMm-target.Left) > tol {
		vs = append(vs, models.Violation{RuleType: "margin_left", Description: "Неверный левый отступ", Severity: "error", ExpectedValue: fmt.Sprintf("%.1f мм", target.Left), ActualValue: fmt.Sprintf("%.1f мм", actual.LeftMm)})
	}
	if math.Abs(actual.RightMm-target.Right) > tol {
		vs = append(vs, models.Violation{RuleType: "margin_right", Description: "Неверный правый отступ", Severity: "error", ExpectedValue: fmt.Sprintf("%.1f мм", target.Right), ActualValue: fmt.Sprintf("%.1f мм", actual.RightMm)})
	}
	return vs
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func checkTables(tables []ParsedTable, config TableConfig) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0

	// If no config fields are set at all, skip
	hasAnyConfig := config.Alignment != "" || config.RequireCaption || config.RequireBorders ||
		config.RequireHeaderRow || config.MaxWidthPct > 0 || config.CaptionDashFormat || config.MinRowHeightMm > 0
	if !hasAnyConfig {
		return vs, 0
	}

	captionKw := config.CaptionKeyword
	if captionKw == "" {
		captionKw = "Таблица"
	}

	for _, t := range tables {
		pos := fmt.Sprintf("Таблица %s", t.ID)

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
			} else {
				// Check caption position rule
				if config.CaptionPosition != "" && config.CaptionPosition != "none" {
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
				// Check caption keyword
				if !strings.Contains(strings.ToLower(t.CaptionText), strings.ToLower(captionKw)) {
					rules++
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

		// 7. Minimum row height (ЕСКД 3.2.5: высота строки ≥ 8 мм)
		if config.MinRowHeightMm > 0 && t.MinRowHeightMm > 0 {
			rules++
			if t.MinRowHeightMm < config.MinRowHeightMm {
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
	return vs, rules
}

func checkFormulas(formulas []ParsedFormula, config FormulaConfig) ([]models.Violation, int) {
	vs := []models.Violation{}
	rules := 0

	hasAnyConfig := config.Alignment != "" || config.RequireNumbering
	if !hasAnyConfig {
		return vs, 0
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
	}
	return vs, rules
}

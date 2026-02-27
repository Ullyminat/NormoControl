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
	tblViolations, tblRules := checkTables(doc.Tables, config.Tables)
	violations = append(violations, tblViolations...)
	totalRules += tblRules

	// Check Formulas (pass paragraphs for spacing/где checks)
	fmViolations, fmRules := checkFormulas(doc.Formulas, doc.Paragraphs, config.Formulas)
	violations = append(violations, fmViolations...)
	totalRules += fmRules

	// Check References (bibliography age)
	if config.References.CheckSourceAge {
		refViolations, refRules := checkReferencesAge(doc.Paragraphs, config.References)
		violations = append(violations, refViolations...)
		totalRules += refRules
	}

	// Check Paragraphs
	lastHeadingLevel := 0
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

		// --- Structure Rules ---

		// 1. Heading 1 starts new page
		if config.Structure.Heading1StartNewPage && headingLevel == 1 && i > 0 {
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
									violations = append(violations, models.Violation{
										RuleType: "toc_page_mismatch", Description: fmt.Sprintf("Несовпадение страниц в оглавлении для '%s'", truncate(titlePart, 20)), PositionInDoc: "Оглавление",
										ExpectedValue: fmt.Sprintf("Стр. %d", actualPage), ActualValue: fmt.Sprintf("Стр. %d", tocPage), Severity: "error",
									})
								}
							} else {
								violations = append(violations, models.Violation{
									RuleType: "toc_missing_heading", Description: fmt.Sprintf("Раздел из оглавления не найден в тексте: '%s'", truncate(titlePart, 30)), PositionInDoc: "Оглавление",
									ExpectedValue: "Наличие раздела в тексте", ActualValue: "Раздел не найден", Severity: "error",
								})
							}
						}
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

			// Spacing: skip if LineSpacing is 0 (means paragraph inherits from style, can't verify)
			if config.Paragraph.LineSpacing > 0 && p.LineSpacing > 0 {
				totalRules++
				// Allow a slightly wider tolerance (0.15) to account for Word's internal
				// rounding when storing line spacing in 240ths-of-line units.
				if math.Abs(p.LineSpacing-config.Paragraph.LineSpacing) > 0.15 {
					violations = append(violations, models.Violation{
						RuleType: "line_spacing", Description: "Неверный междустрочный интервал", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.2f", config.Paragraph.LineSpacing), ActualValue: fmt.Sprintf("%.2f", p.LineSpacing), Severity: "warning",
						ContextText: p.Text,
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
					})
				}
			}

			// Indentation — skip list items (they use list indentation, not first-line indent)
			if config.Paragraph.FirstLineIndent > 0 && !p.IsListItem {
				totalRules++
				// Tolerance is 3mm: Word stores indent in twips and rounding can cause
				// small discrepancies (~1-2mm). Also students sometimes set 1.25cm vs 1.27cm.
				if math.Abs(p.FirstLineIndentMm-config.Paragraph.FirstLineIndent) > 3.0 {
					violations = append(violations, models.Violation{
						RuleType: "indent", Description: "Неверный отступ первой строки", PositionInDoc: pos,
						ExpectedValue: fmt.Sprintf("%.1f мм", config.Paragraph.FirstLineIndent), ActualValue: fmt.Sprintf("%.1f мм", p.FirstLineIndentMm), Severity: "warning",
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

	// Calculate Score
	// Proper formula: score = (passed / total) * 100
	passedRules := totalRules - len(violations)
	if passedRules < 0 {
		passedRules = 0
	}

	score := 0.0
	if totalRules > 0 {
		// Cap violations at totalRules to avoid negative scores when multiple violations hit same rule
		effectiveViolations := len(violations)
		if effectiveViolations > totalRules {
			effectiveViolations = totalRules
		}
		passedRules = totalRules - effectiveViolations
		if passedRules < 0 {
			passedRules = 0
		}
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
	// Remove all whitespace (spaces, NBSP, tabs, etc.)
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if r != ' ' && r != '\t' && r != '\n' && r != '\r' && r != '\u00a0' && r != '\u200b' {
			b.WriteRune(r)
		}
	}
	return b.String()
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
				hasBefore := wrapperIdx > 0 && isEmptyOrSpaced(paragraphs[wrapperIdx-1])
				hasAfter := wrapperIdx < len(paragraphs)-1 && isEmptyOrSpaced(paragraphs[wrapperIdx+1])
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
				vs = append(vs, models.Violation{
					RuleType:      "reference_age",
					Description:   fmt.Sprintf("\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0443\u0441\u0442\u0430\u0440\u0435\u043b (%d \u0433.): \u0441\u0442\u0430\u0440\u0448\u0435 %d \u043b\u0435\u0442 \u043e\u0442 %d", year, maxAge, currentYear),
					PositionInDoc: pos,
					ExpectedValue: fmt.Sprintf("\u041d\u0435 \u0440\u0430\u043d\u044c\u0448\u0435 %d \u0433\u043e\u0434\u0430", oldestAllowed),
					ActualValue:   fmt.Sprintf("%d \u0433\u043e\u0434", year),
					Severity:      "warning",
					ContextText:   truncate(text, 150),
				})
				break // one violation per reference entry
			}
		}
	}

	return vs, rules
}

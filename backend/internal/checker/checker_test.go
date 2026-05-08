package checker

import (
	"strings"
	"testing"
)

func TestInferNumberingModePrefersSectionWhenAnyDottedNumberExists(t *testing.T) {
	items := []objectCaptionNumber{
		{Number: "1", Text: "Рисунок 1"},
		{Number: "1.1", Text: "Рисунок 1.1"},
	}

	if got := inferNumberingMode(items, "auto"); got != "section" {
		t.Fatalf("expected section numbering, got %q", got)
	}
}

func TestSectionCaptionSequenceDetectsGap(t *testing.T) {
	items := []objectCaptionNumber{
		{Number: "1.1", Text: "Рисунок 1.1", Ordinal: 1},
		{Number: "1.3", Text: "Рисунок 1.3", Ordinal: 2},
	}

	violations, _ := checkObjectCaptionSequence("image", items, "auto")
	if len(violations) == 0 {
		t.Fatal("expected a sequence violation for missing 1.2")
	}
	if violations[0].ExpectedValue != "1.2" || violations[0].ActualValue != "1.3" {
		t.Fatalf("unexpected violation: expected=%q actual=%q", violations[0].ExpectedValue, violations[0].ActualValue)
	}
}

func TestCaptionNumberExtractionAllowsSeparatorBeforeDottedNumber(t *testing.T) {
	cases := map[string]string{
		"Рисунок - 1.1 – Архитектура": "1.1",
		"Рисунок № 2.3. Схема":        "2.3",
		"Табл. — 3.2 – Данные":        "3.2",
	}

	for input, want := range cases {
		re := figureCaptionNumberRe
		if strings.HasPrefix(input, "Табл") {
			re = tableCaptionNumberRe
		}
		if got := extractCaptionNumber(input, re); got != want {
			t.Fatalf("extractCaptionNumber(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestFigureReferenceToMissingDottedCaptionIsDetectedFromParagraphCaptions(t *testing.T) {
	paragraphs := []ParsedParagraph{
		{Text: "На рисунке 1.1 представлена диаграмма.", Role: "body", PageNumber: 1},
		{Text: "Рисунок 1.1 – Диаграмма прецедентов", Role: "figure_caption", PageNumber: 1},
		{Text: "На рисунке 1.3 представлена диаграмма деятельности.", Role: "body", PageNumber: 1},
	}

	captions := captionNumberSetFromParagraphs(paragraphs, "figure_caption", figureCaptionNumberRe)
	violations, rules := checkObjectTextReferences("image", captions, paragraphs, figureRefRegex)

	if rules != 2 {
		t.Fatalf("expected 2 checked references, got %d", rules)
	}
	if len(violations) != 1 {
		t.Fatalf("expected one missing-reference violation, got %d", len(violations))
	}
	if violations[0].ExpectedValue != "Существующая подпись 1.3" {
		t.Fatalf("unexpected violation expected value: %q", violations[0].ExpectedValue)
	}
}

func TestSectionSequenceUsesCaptionParagraphsEvenWithoutParsedImages(t *testing.T) {
	paragraphs := []ParsedParagraph{
		{Text: "Рисунок 1.1 – Диаграмма прецедентов", Role: "figure_caption", PageNumber: 1},
		{Text: "Рисунок 1.3 – Диаграмма деятельности", Role: "figure_caption", PageNumber: 1},
	}

	items := captionNumbersFromParagraphs(paragraphs, "figure_caption", figureCaptionNumberRe)
	violations, _ := checkObjectCaptionSequence("image", items, "auto")

	if len(violations) == 0 {
		t.Fatal("expected sequence violation for missing 1.2")
	}
	if violations[0].ExpectedValue != "1.2" || violations[0].ActualValue != "1.3" {
		t.Fatalf("unexpected sequence violation: expected=%q actual=%q", violations[0].ExpectedValue, violations[0].ActualValue)
	}
}

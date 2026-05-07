package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type GeminiClient struct {
	APIKey string
	Model  string
}

func NewGeminiClient(apiKey string) *GeminiClient {
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-2.5-flash"
	}

	return &GeminiClient{
		APIKey: apiKey,
		Model:  strings.TrimPrefix(model, "models/"),
	}
}

type GeminiRequest struct {
	Contents []Content `json:"contents"`
}

type Content struct {
	Parts []Part `json:"parts"`
}

type Part struct {
	Text string `json:"text"`
}

type GeminiResponse struct {
	Candidates []Candidate `json:"candidates"`
}

type Candidate struct {
	Content Content `json:"content"`
}

// AIResponse is our internal structured response
type AIResponse struct {
	IsValid     bool   `json:"is_valid"`
	Explanation string `json:"explanation"`
	Suggestion  string `json:"suggestion"`
}

func (c *GeminiClient) VerifyFragment(fragment string, rule string, expected string, actual string) (*AIResponse, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("Gemini API Key is not set")
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", c.Model, c.APIKey)

	prompt := fmt.Sprintf(`Ты — эксперт по нормоконтролю научных работ. 
Проверь фрагмент текста на соответствие правилу.
Текст фрагмента: "%s"
Название правила: %s
Ожидалось: %s
Найдено алгоритмом: %s

Твоя задача: понять, действительно ли здесь ошибка или алгоритм ошибся из-за сложности формата Word.
Ответь ТОЛЬКО в формате JSON, без лишних слов, вступлений и markdown-разметки:
{
  "is_valid": true (если ошибки НЕТ) или false (если ошибка РЕАЛЬНАЯ),
  "explanation": "краткое объяснение почему это так",
  "suggestion": "конкретный совет как исправить, если это ошибка"
}`, fragment, rule, expected, actual)

	reqBody := GeminiRequest{
		Contents: []Content{
			{
				Parts: []Part{
					{Text: prompt},
				},
			},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			available, _ := c.ListModels()
			return nil, fmt.Errorf("model %s not found. Available models for this key: %v", c.Model, available)
		}
		return nil, fmt.Errorf("gemini api error: %s", string(body))
	}

	var geminiResp GeminiResponse
	if err := json.Unmarshal(body, &geminiResp); err != nil {
		return nil, err
	}

	if len(geminiResp.Candidates) == 0 {
		return nil, fmt.Errorf("no candidates from gemini")
	}

	// Extract JSON from the markdown response Gemini often gives
	responseText := geminiResp.Candidates[0].Content.Parts[0].Text
	return parseAIResponse(responseText)
}

func (c *GeminiClient) ListModels() ([]string, error) {
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", c.APIKey)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)

	var names []string
	for _, m := range result.Models {
		names = append(names, m.Name)
	}
	return names, nil
}

func parseAIResponse(raw string) (*AIResponse, error) {
	// Simple JSON extractor (handles ```json ... ```)
	start := bytes.Index([]byte(raw), []byte("{"))
	end := bytes.LastIndex([]byte(raw), []byte("}"))
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("invalid json in ai response")
	}

	var res AIResponse
	if err := json.Unmarshal([]byte(raw[start:end+1]), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

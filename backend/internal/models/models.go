package models

import (
	"time"
)

type User struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	Email        string    `json:"email" gorm:"unique;not null"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role" gorm:"not null"` // student, teacher, admin
	FullName     string    `json:"full_name"`
	GroupID      *uint     `json:"group_id"`
	CreatedAt    time.Time `json:"created_at"`
	IsActive     bool      `json:"is_active" gorm:"default:true"`
}

type StudentGroup struct {
	ID            uint   `json:"id" gorm:"primaryKey"`
	GroupName     string `json:"group_name" gorm:"unique;not null"`
	Faculty       string `json:"faculty"`
	SpecialtyCode string `json:"specialty_code"`
	SpecialtyName string `json:"specialty_name"`
	CuratorID     *uint  `json:"curator_id"`
	CreatedYear   int    `json:"created_year"`
}

type FormattingStandard struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	CreatedBy    uint      `json:"created_by"`
	AuthorName   string    `json:"author_name"`
	DocumentType string    `json:"document_type"`
	IsPublic     bool      `json:"is_public"`
	ModulesJSON  string    `json:"modules_json"` // List of ValidationModule stored as JSON
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ValidationModule struct {
	ID     string                 `json:"id"`     // uuid or simple random string
	Name   string                 `json:"name"`   // e.g., "Title Page"
	Config map[string]interface{} `json:"config"` // The extracted rules
}

type Document struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id"`
	FileName     string    `json:"file_name"`
	FilePath     string    `json:"file_path"`
	FileSize     int64     `json:"file_size"`
	UploadDate   time.Time `json:"upload_date"`
	Status       string    `json:"status"` // new, processing, checked
	MetadataJSON string    `json:"metadata_json"`
}

type CheckResult struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	DocumentID     uint      `json:"document_id"`
	StandardID     uint      `json:"standard_id"`
	CheckDate      time.Time `json:"check_date"`
	OverallScore   float64   `json:"overall_score"`
	TotalRules     int       `json:"total_rules"`
	PassedRules    int       `json:"passed_rules"`
	FailedRules    int       `json:"failed_rules"`
	ProcessingTime int       `json:"processing_time"` // ms
	ReportPath     string    `json:"report_path"`
	ContentJSON    string    `json:"content_json"` // Serialized []ParsedParagraph for Reader View
}

type Violation struct {
	ID            uint   `json:"id" gorm:"primaryKey"`
	ResultID      uint   `json:"result_id"`
	RuleType      string `json:"rule_type"`
	Description   string `json:"description"`
	Severity      string `json:"severity"` // critical, error, warning
	PositionInDoc string `json:"position_in_doc"`
	ExpectedValue string `json:"expected_value"`
	ActualValue   string `json:"actual_value"`
	Suggestion    string `json:"suggestion"`
}

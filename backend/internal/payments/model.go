package payments

type Payment struct {
	ID              string  `json:"id"`
	TenantID        string  `json:"tenant_id"`
	EnrollmentID    string  `json:"enrollment_id"`
	Kind            string  `json:"kind"` // 'enrollment' | 'monthly'
	Amount          string  `json:"amount"`
	ReferenceCode   string  `json:"reference_code"`
	Status          string  `json:"status"`
	ReceiptFileURL  string  `json:"receipt_file_url"`
	ReceiptGroupID  *string `json:"receipt_group_id,omitempty"`
	PeriodYear      *int    `json:"period_year,omitempty"`
	PeriodMonth     *int    `json:"period_month,omitempty"`
	DepositedAt     *string `json:"deposited_at,omitempty"`
	VerifiedAt      *string `json:"verified_at,omitempty"`
	VerifiedBy      *string `json:"verified_by,omitempty"`
	RejectionReason *string `json:"rejection_reason,omitempty"`
	CreatedAt       string  `json:"created_at"`

	// Joined (read-only)
	StudentID    string `json:"student_id,omitempty"`
	StudentName  string `json:"student_name,omitempty"`
	StudentEmail string `json:"student_email,omitempty"`
	CourseID     string `json:"course_id,omitempty"`
	CourseTitle  string `json:"course_title,omitempty"`
}

type Period struct {
	Year  int `json:"year"`
	Month int `json:"month"`
}

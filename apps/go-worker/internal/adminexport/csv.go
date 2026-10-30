// Package adminexport streams bounded admin CSV exports from PostgreSQL.
// Express remains responsible for authenticating and authorizing the admin.
package adminexport

import (
	"context"
	"database/sql"
	"io"
	"strconv"
	"strings"
	"time"
)

const ExportLimit = 5000

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// WriteUsersCSV writes the same columns and row limit as adminService's
// existing users CSV export, without materializing the result set in memory.
func WriteUsersCSV(ctx context.Context, db queryer, dst io.Writer) error {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "email", "name", "role"::text, "isActive", "createdAt"
		FROM "users"
		ORDER BY "createdAt" DESC
		LIMIT $1
	`, ExportLimit)
	if err != nil {
		return err
	}
	defer rows.Close()

	wroteRow := false
	if err := writeCSVRow(dst, &wroteRow, []string{"id", "email", "name", "role", "isActive", "createdAt"}); err != nil {
		return err
	}

	for rows.Next() {
		var id, email, name, role string
		var isActive bool
		var createdAt time.Time
		if err := rows.Scan(&id, &email, &name, &role, &isActive, &createdAt); err != nil {
			return err
		}
		values := []string{
			id,
			email,
			name,
			role,
			strconv.FormatBool(isActive),
			createdAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		}
		if err := writeCSVRow(dst, &wroteRow, values); err != nil {
			return err
		}
	}
	return rows.Err()
}

// WriteReportsCSV streams the currently exported report fields in the same
// order and within the same 5,000-row cap as the Express implementation.
func WriteReportsCSV(ctx context.Context, db queryer, dst io.Writer) error {
	rows, err := db.QueryContext(ctx, `
		SELECT
			"id",
			"reason"::text,
			"status"::text,
			"targetType"::text,
			"targetId",
			"userId",
			"notes",
			"createdAt"
		FROM "reports"
		ORDER BY "createdAt" DESC
		LIMIT $1
	`, ExportLimit)
	if err != nil {
		return err
	}
	defer rows.Close()

	wroteRow := false
	if err := writeCSVRow(dst, &wroteRow, []string{
		"id", "reason", "status", "targetType", "targetId", "userId", "notes", "createdAt",
	}); err != nil {
		return err
	}

	for rows.Next() {
		var id, reason, status, targetType, targetID, userID string
		var notes sql.NullString
		var createdAt time.Time
		if err := rows.Scan(&id, &reason, &status, &targetType, &targetID, &userID, &notes, &createdAt); err != nil {
			return err
		}
		values := []string{
			id,
			reason,
			status,
			targetType,
			targetID,
			userID,
			notes.String,
			createdAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		}
		if err := writeCSVRow(dst, &wroteRow, values); err != nil {
			return err
		}
	}
	return rows.Err()
}

func writeCSVRow(dst io.Writer, wroteRow *bool, values []string) error {
	if *wroteRow {
		if _, err := io.WriteString(dst, "\n"); err != nil {
			return err
		}
	}
	for index, value := range values {
		if index > 0 {
			if _, err := io.WriteString(dst, ","); err != nil {
				return err
			}
		}
		if _, err := io.WriteString(dst, escapeCSVCell(value)); err != nil {
			return err
		}
	}
	*wroteRow = true
	return nil
}

// escapeCSVCell preserves the existing Express behavior: formula-like cells
// are prefixed with an apostrophe and RFC 4180 quoting handles delimiters,
// double quotes, and line breaks.
func escapeCSVCell(value string) string {
	if value != "" {
		switch value[0] {
		case '=', '+', '-', '@', '\t', '\r':
			value = "'" + value
		}
	}
	if strings.ContainsAny(value, ",\"\n\r") {
		return "\"" + strings.ReplaceAll(value, "\"", "\"\"") + "\""
	}
	return value
}

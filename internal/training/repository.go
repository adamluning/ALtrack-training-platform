/* ------------ Interface for database communication -----------------
Structure:
	sessions:
		CreateSession
		GetSessionsGroupedByDay
		GetSessionsByMonth
		CompleteSession
		CreateSessionNote
		DeleteSession
	goals:
		CreateGoal
		GetGoalsByYear
		DeleteGoal
	stats:
		GetMonthlyStats
		GetYearlyStats
	PBs:
		CreatePB
		GetPBs
		DeletePB
-------------------------------------------------------------------- */

package training

import (
	"log"
	"time"
	"train-platform/internal/db"
)

func CreateSession(userID int, title, desc string, date time.Time, completed bool, notes string, distance_km float64, duration_min int) error {
	query := `INSERT INTO sessions (user_id, title, description, session_date, completed, notes, distance_km, duration_min)
	          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
	_, err := db.DB.Exec(query, userID, title, desc, date, completed, notes, distance_km, duration_min)
	if err != nil {
		log.Println("CreateSession DB error:", err)
	}
	return err
}

func GetSessionsGroupedByDay(userID, year, month int) (map[string][]Session, error) {
	query := `
		SELECT id, title, description, session_date, completed, notes, distance_km, duration_min
		FROM sessions
		WHERE user_id=$1
		AND EXTRACT(YEAR FROM session_date)=$2
		AND EXTRACT(MONTH FROM session_date)=$3
		ORDER BY session_date`
	rows, err := db.DB.Query(query, userID, year, month)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]Session)

	for rows.Next() {
		var s Session
		var date time.Time

		err := rows.Scan(&s.ID, &s.Title, &s.Description, &date, &s.Completed, &s.Notes, &s.DistanceKm, &s.DurationMin)
		if err != nil {
			return nil, err
		}

		s.Date = date.Format("2006-01-02")
		result[s.Date] = append(result[s.Date], s)
	}

	return result, nil
}

func GetSessionsByMonth(userID, year, month int) ([]Session, error) {
	query := `SELECT id, title, description, session_date, completed, notes
			  FROM sessions
			  WHERE user_id=$1
			  AND EXTRACT(YEAR FROM session_date)=$2
			  AND EXTRACT(MONTH FROM session_date)=$3
			  ORDER BY session_date`
	rows, err := db.DB.Query(query, userID, year, month)

	if err != nil {
		log.Println("GetSessionsByMonth query error:", err)
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var s Session
		var date time.Time

		err := rows.Scan(&s.ID, &s.Title, &s.Description, &date, &s.Completed, &s.Notes)
		if err != nil {
			return nil, err
		}

		s.Date = date.Format("2006-01-02")
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func CompleteSession(userID int, id int64, distance_km float64, duration_min int) error {
	query := `UPDATE sessions
			  SET completed=true,
				  distance_km=$1,
				  duration_min=$2
			  WHERE user_id=$3 AND id=$4`
	_, err := db.DB.Exec(query, distance_km, duration_min, userID, id)
	return err
}

func UpdateSession(userID int, id int64, title, desc, notes string, distance_km float64, duration_min int) error {
	query := `UPDATE sessions
			  SET title=$1,
				  description=$2,
				  notes=$3,
				  distance_km=$4,
				  duration_min=$5
			  WHERE user_id=$6 AND id=$7`
	_, err := db.DB.Exec(query, title, desc, notes, distance_km, duration_min, userID, id)
	return err
}

func CreateSessionNote(userID int, id int64, note string) error {
	query := `UPDATE sessions SET notes=$1 WHERE user_id=$2 AND id=$3`
	_, err := db.DB.Exec(query, note, userID, id)
	return err
}

func DeleteSession(userID int, id int64) error {
	query := `DELETE FROM sessions WHERE user_id=$1 AND id=$2`
	_, err := db.DB.Exec(query, userID, id)
	return err
}

func CreateGoal(userID int, title, target string, date time.Time) error {
	query := `INSERT INTO goals (user_id, title, target, end_date)
	          VALUES ($1,$2,$3,$4)`
	_, err := db.DB.Exec(query, userID, title, target, date)
	if err != nil {
		log.Println("CreateGoal DB error:", err)
	}
	return err
}

func GetGoalsByYear(userID, year int) ([]Goal, error) {
	query := `SELECT id, title, target, end_date
			  FROM goals
			  WHERE user_id=$1 AND EXTRACT(YEAR FROM end_date)=$2
			  ORDER BY end_date`
	rows, err := db.DB.Query(query, userID, year)

	if err != nil {
		log.Println("GetGoalsByYear query error:", err)
		return nil, err
	}
	defer rows.Close()

	var goals []Goal
	for rows.Next() {
		var g Goal
		var date time.Time

		err := rows.Scan(&g.ID, &g.Title, &g.Target, &date)
		if err != nil {
			return nil, err
		}

		g.EndDate = date.Format("2006-01-02")
		goals = append(goals, g)
	}
	return goals, nil
}

func UpdateGoal(userID int, id int64, title, target, endDate string) error {
	query := `UPDATE goals
			  SET title=$1,
				  target=$2,
				  end_date=$3
			  WHERE user_id=$4 AND id=$5`
	_, err := db.DB.Exec(query, title, target, endDate, userID, id)
	return err
}

func DeleteGoal(userID int, id int64) error {
	query := `DELETE FROM goals WHERE user_id=$1 AND id=$2`
	_, err := db.DB.Exec(query, userID, id)
	return err
}

func GetMonthlyStats(userID, year, month int) (float64, int, error) {
	query := `SELECT 
			  	  COALESCE(SUM(distance_km),0),
				  COALESCE(SUM(duration_min),0)
			  FROM sessions
			  WHERE user_id=$1
			  AND completed=true
			  AND EXTRACT(YEAR FROM session_date)=$2
			  AND EXTRACT(MONTH FROM session_date)=$3`
	row := db.DB.QueryRow(query, userID, year, month)

	var totalDistance float64
	var totalDuration int
	err := row.Scan(&totalDistance, &totalDuration)
	return totalDistance, totalDuration, err
}

func GetYearlyStats(userID, year int) ([]MonthlyVolume, error) {
	query := `SELECT 
				  EXTRACT(MONTH FROM session_date)::int AS month,
				  COALESCE(SUM(distance_km),0) AS distance_km,
			      COALESCE(SUM(duration_min),0) AS duration_min
			  FROM sessions
			  WHERE user_id=$1
			  AND completed = true
			  AND EXTRACT(YEAR FROM session_date) = $2
			  GROUP BY month
			  ORDER BY month`
	rows, err := db.DB.Query(query, userID, year)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	monthMap := make(map[int]MonthlyVolume)
	for m := 1; m <= 12; m++ {
		monthMap[m] = MonthlyVolume{
			Year:        year,
			Month:       m,
			DistanceKm:  0,
			DurationMin: 0,
		}
	}

	for rows.Next() {
		var m MonthlyVolume
		m.Year = year
		if err := rows.Scan(&m.Month, &m.DistanceKm, &m.DurationMin); err != nil {
			return nil, err
		}
		monthMap[m.Month] = m
	}

	result := make([]MonthlyVolume, 0, 12)
	for m := 1; m <= 12; m++ {
		result = append(result, monthMap[m])
	}

	return result, nil
}

func CreatePB(userID int, distance float64, time string) error {
	query := `INSERT INTO pbs (user_id, distance, time)
	          VALUES ($1,$2,$3)`
	_, err := db.DB.Exec(query, userID, distance, time)
	if err != nil {
		log.Println("CreatePB DB error:", err)
	}
	return err
}

func GetPBs(userID int) ([]PB, error) {
	query := `SELECT id, distance, time::text
			  FROM pbs
			  WHERE user_id=$1`
	rows, err := db.DB.Query(query, userID)

	if err != nil {
		log.Println("GetPBs query error:", err)
		return nil, err
	}
	defer rows.Close()

	var pbs []PB
	for rows.Next() {
		var pb PB
		var timeStr string

		err := rows.Scan(&pb.ID, &pb.Distance, &timeStr)
		if err != nil {
			return nil, err
		}

		pb.Time = timeStr
		pbs = append(pbs, pb)
	}
	return pbs, nil
}

func UpdatePB(userID int, id int64, distance float64, time string) error {
	query := `UPDATE pbs
			  SET distance=$1,
				  time=$2
			  WHERE user_id=$3 AND id=$4`
	_, err := db.DB.Exec(query, distance, time, userID, id)
	return err
}

func DeletePB(userID int, id int64) error {
	query := `DELETE FROM pbs WHERE user_id=$1 AND id=$2`
	_, err := db.DB.Exec(query, userID, id)
	return err
}

package training

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func GetCalendarHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	data, err := GetSessionsGroupedByDay(userID, year, month)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, data)
}

func CreateSessionHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	var s Session
	if err := c.BindJSON(&s); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	// parse date
	parsedDate, err := time.Parse("2006-01-02", s.Date)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid date format (use YYYY-MM-DD)"})
		return
	}

	err = CreateSession(userID, s.Title, s.Description, parsedDate, s.Completed, s.Notes, 0.0, 0)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"status": "created"})
}

func GetSessionsHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	sessions, err := GetSessionsByMonth(userID, year, month)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, sessions)
}

func CompleteSessionHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

	var body struct {
		DistanceKm  float64 `json:"distance_km"`
		DurationMin int     `json:"duration_min"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid input"})
		return
	}

	err := CompleteSession(userID, id, body.DistanceKm, body.DurationMin)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "completed"})
}

func UpdateSessionHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Note        string  `json:"note"`
		DistanceKm  float64 `json:"distance_km"`
		DurationMin int     `json:"duration_min"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	err := UpdateSession(userID, id, body.Title, body.Description, body.Note, body.DistanceKm, body.DurationMin)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "updated"})
}

func CreateSessionNoteHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Note string `json:"note"`
	}
	c.BindJSON(&body)
	err := CreateSessionNote(userID, id, body.Note)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "noted"})
}

func DeleteSessionHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	err := DeleteSession(userID, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "deleted"})
}

func CreateGoalHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	var g Goal
	if err := c.BindJSON(&g); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	// parse date
	parsedDate, err := time.Parse("2006-01-02", g.EndDate)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid date format (use YYYY-MM-DD)"})
		return
	}

	err = CreateGoal(userID, g.Title, g.Target, parsedDate)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"status": "created"})
}

func GetGoalsHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	year, _ := strconv.Atoi(c.Query("year"))

	goals, err := GetGoalsByYear(userID, year)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, goals)
}

func UpdateGoalHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Title   string `json:"title"`
		Target  string `json:"target"`
		EndDate string `json:"end_date"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	err := UpdateGoal(userID, id, body.Title, body.Target, body.EndDate)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "updated"})
}

func DeleteGoalHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	err := DeleteGoal(userID, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "deleted"})
}

func GetMonthlyStatsHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	year, _ := strconv.Atoi(c.Query("year"))
	month, _ := strconv.Atoi(c.Query("month"))

	monthlyDistance, monthlyDuration, err := GetMonthlyStats(userID, year, month)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"monthly_distance_km": monthlyDistance,
		"monthly_duration_min": monthlyDuration,
	})
}

func GetYearlyStatsHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	year, _ := strconv.Atoi(c.Query("year"))

	data, err := GetYearlyStats(userID, year)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, data)
}

func AddOldStatsHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	var mv MonthlyVolume
	if err := c.BindJSON(&mv); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	// parse date
	date := ""
	if mv.Month < 10 {
		date = fmt.Sprintf("%d-0%d-01", mv.Year, mv.Month)
	} else {
		date = fmt.Sprintf("%d-%d-01", mv.Year, mv.Month)
	}
	parsedDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid date format (use YYYY-MM-DD)"})
		return
	}

	err = CreateSession(userID, "synthetic session", "", parsedDate, true, "", mv.DistanceKm, mv.DurationMin)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"status": "created"})
}

func CreatePBHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	var pb PB
	if err := c.BindJSON(&pb); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	// Validate format HH:MM:SS
	_, err := time.Parse("15:04:05", pb.Time)
	if err != nil {
		c.JSON(400, gin.H{"error": "time must be HH:MM:SS"})
		return
	}

	err = CreatePB(userID, pb.Distance, pb.Time)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"status": "created"})
}

func GetPBsHandler(c *gin.Context) {
	userID := c.GetInt("user_id")

	pbs, err := GetPBs(userID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, pbs)
}

func UpdatePBHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Distance float64 `json:"distance"`
		Time     string  `json:"time"`
	}

	if err := c.BindJSON(&body); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	err := UpdatePB(userID, id, body.Distance, body.Time)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "updated"})
}

func DeletePBHandler(c *gin.Context) {
	if c.GetBool("is_guest") {
		c.JSON(403, gin.H{"error": "guest users cannot modify data"})
		return
	}

	userID := c.GetInt("user_id")

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	err := DeletePB(userID, id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "deleted"})
}

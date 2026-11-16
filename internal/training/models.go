package training

type Goal struct {
	ID      int64  `json:"id"`
	Title   string `json:"title"`
	Target  string `json:"target"`
	EndDate string `json:"end_date"`
}

type Session struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
	Completed   bool    `json:"completed"`
	Notes       string  `json:"notes"`
	DistanceKm  float64 `json:"distance_km"`
	DurationMin int     `json:"duration_min"`
}

type PB struct {
	ID       int64   `json:"id"`
	Distance float64 `json:"distance"`
	Time     string  `json:"time"`
}

type MonthlyVolume struct {
	Year        int     `json:"year"`
	Month       int     `json:"month"`
	DistanceKm  float64 `json:"distance_km"`
	DurationMin int     `json:"duration_min"`
}

type WeeklyVolume struct {
	Year        int     `json:"year"`
	Week        int     `json:"week"`
	DistanceKm  float64 `json:"distance_km"`
	DurationMin int     `json:"duration_min"`
}

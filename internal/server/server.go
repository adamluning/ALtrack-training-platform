package server

import (
	"train-platform/internal/auth"
	"train-platform/internal/middleware"
	"train-platform/internal/training"

	"github.com/gin-gonic/gin"
)

func New() *gin.Engine {
	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(200)
			return
		}

		c.Next()
	})

	authHandler := auth.NewHandler()

	r.POST("/auth/register", authHandler.Register)
	r.POST("/auth/login", authHandler.Login)

	protected := r.Group("/")
	protected.Use(middleware.AuthRequired())

	protected.GET("/calendar", training.GetCalendarHandler)

	protected.POST("/sessions", training.CreateSessionHandler)
	protected.GET("/sessions", training.GetSessionsHandler)
	protected.PUT("/sessions/:id", training.UpdateSessionHandler)
	protected.PUT("/sessions/:id/complete", training.CompleteSessionHandler)
	protected.PUT("/sessions/:id/note", training.CreateSessionNoteHandler)
	protected.DELETE("/sessions/:id/delete", training.DeleteSessionHandler)

	protected.POST("/goals", training.CreateGoalHandler)
	protected.GET("/goals", training.GetGoalsHandler)
	protected.PUT("/goals/:id", training.UpdateGoalHandler)
	protected.DELETE("/goals/:id/delete", training.DeleteGoalHandler)

	protected.GET("/stats/month", training.GetMonthlyStatsHandler)
	protected.GET("/stats/year", training.GetYearlyStatsHandler)
	protected.POST("stats/manual", training.AddOldStatsHandler)

	protected.POST("/pbs", training.CreatePBHandler)
	protected.GET("/pbs", training.GetPBsHandler)
	protected.PUT("/pbs/:id", training.UpdatePBHandler)
	protected.DELETE("/pbs/:id/delete", training.DeletePBHandler)

	return r
}

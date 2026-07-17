package main

import (
	"log"
	"train-platform/internal/db"
	"train-platform/internal/server"

	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found")
	}

	db.Init()
	app := server.New()
	log.Println("API running on :8080")
	app.Run(":8080")
}
package api

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// fsmDBLogger prints GORM events in FSM style: one line, no SQL unless FSM_DEBUG_SQL=1.
// "record not found" is a normal lookup result and is never logged.
type fsmDBLogger struct {
	debug bool
}

func newDBLogger() gormlogger.Interface {
	return &fsmDBLogger{debug: os.Getenv("FSM_DEBUG_SQL") == "1"}
}

func (l *fsmDBLogger) LogMode(gormlogger.LogLevel) gormlogger.Interface { return l }
func (l *fsmDBLogger) Info(_ context.Context, msg string, args ...interface{}) {
	log.Printf("DB: "+msg, args...)
}
func (l *fsmDBLogger) Warn(_ context.Context, msg string, args ...interface{}) {
	log.Printf("DB warning: "+msg, args...)
}
func (l *fsmDBLogger) Error(_ context.Context, msg string, args ...interface{}) {
	log.Printf("DB error: "+msg, args...)
}
func (l *fsmDBLogger) Trace(_ context.Context, begin time.Time, fc func() (string, int64), err error) {
	elapsed := time.Since(begin)
	switch {
	case err != nil && !errors.Is(err, gorm.ErrRecordNotFound):
		sql, _ := fc()
		if l.debug {
			log.Printf("DB error: %v (%s) %s", err, elapsed.Round(time.Millisecond), sql)
		} else {
			log.Printf("DB error: %v", err)
		}
	case elapsed > 500*time.Millisecond:
		log.Printf("DB: slow query (%s)", elapsed.Round(time.Millisecond))
	case l.debug:
		sql, rows := fc()
		log.Printf("DB: %s [rows:%d]", sql, rows)
	}
}

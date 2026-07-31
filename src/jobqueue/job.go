package jobqueue

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Status int

const (
	StatusPending Status = iota
	StatusRunning
	StatusCompleted
	StatusFailed
	StatusCancelled
)

func (s Status) String() string {
	switch s {
	case StatusPending:
		return "pending"
	case StatusRunning:
		return "running"
	case StatusCompleted:
		return "completed"
	case StatusFailed:
		return "failed"
	case StatusCancelled:
		return "cancelled"
	default:
		return "unknown"
	}
}

type Job struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	InstanceName string   `json:"instance_name,omitempty"`
	Status      string    `json:"status"`
	Progress    int       `json:"progress"`
	Message     string    `json:"message"`
	CreatedAt   time.Time `json:"created_at"`
	StartedAt   time.Time `json:"started_at,omitempty"`
	FinishedAt  time.Time `json:"finished_at,omitempty"`

	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.RWMutex
}

func (j *Job) SetProgress(pct int, msg string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Progress = pct
	j.Message = msg
}

func (j *Job) SetRunning() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = StatusRunning.String()
	j.StartedAt = time.Now()
}

func (j *Job) SetCompleted(msg string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = StatusCompleted.String()
	j.Progress = 100
	j.Message = msg
	j.FinishedAt = time.Now()
}

func (j *Job) SetFailed(msg string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = StatusFailed.String()
	j.Message = msg
	j.FinishedAt = time.Now()
}

func (j *Job) SetCancelled() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = StatusCancelled.String()
	j.Message = "cancelled"
	j.FinishedAt = time.Now()
}

func (j *Job) IsDone() bool {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.Status == StatusCompleted.String() || j.Status == StatusFailed.String() || j.Status == StatusCancelled.String()
}

type Broadcaster interface {
	Send(room string, msg interface{})
}

type Queue struct {
	mu         sync.RWMutex
	jobs       map[string]*Job
	history    []*Job
	maxHistory int
	broadcast  Broadcaster
	counter    int
}

func NewQueue(broadcast Broadcaster, maxHistory int) *Queue {
	return &Queue{
		jobs:       make(map[string]*Job),
		maxHistory: maxHistory,
		broadcast:  broadcast,
	}
}

func (q *Queue) Submit(name string, run func(ctx context.Context, job *Job) error) *Job {
	q.mu.Lock()
	q.counter++
	id := fmt.Sprintf("%d", q.counter)
	ctx, cancel := context.WithCancel(context.Background())
	job := &Job{
		ID:        id,
		Name:      name,
		Status:    StatusPending.String(),
		CreatedAt: time.Now(),
		ctx:       ctx,
		cancel:    cancel,
	}
	q.jobs[id] = job
	q.mu.Unlock()
	q.broadcastUpdate()

	go func() {
		job.SetRunning()
		q.broadcastUpdate()
		err := run(ctx, job)
		if err != nil {
			if ctx.Err() != nil {
				job.SetCancelled()
			} else {
				job.SetFailed(err.Error())
			}
		} else {
			job.SetCompleted("done")
		}
		q.broadcastUpdate()
		q.moveToHistory(id)
	}()
	return job
}

func (q *Queue) Cancel(id string) bool {
	q.mu.RLock()
	job, ok := q.jobs[id]
	q.mu.RUnlock()
	if !ok || job.IsDone() {
		return false
	}
	job.cancel()
	return true
}

func (q *Queue) List() []*Job {
	q.mu.RLock()
	defer q.mu.RUnlock()
	result := make([]*Job, 0, len(q.jobs)+len(q.history))
	for _, j := range q.jobs {
		result = append(result, j)
	}
	for _, j := range q.history {
		result = append(result, j)
	}
	return result
}

func (q *Queue) moveToHistory(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if job, ok := q.jobs[id]; ok {
		delete(q.jobs, id)
		q.history = append([]*Job{job}, q.history...)
		if len(q.history) > q.maxHistory {
			q.history = q.history[:q.maxHistory]
		}
	}
}

func (q *Queue) broadcastUpdate() {
	if q.broadcast == nil {
		return
	}
	q.broadcast.Send("jobs", q.List())
}

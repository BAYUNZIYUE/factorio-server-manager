package jobqueue

var GlobalQueue *Queue

func SetGlobalQueue(q *Queue) { GlobalQueue = q }

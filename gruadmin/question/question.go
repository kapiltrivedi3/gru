package question

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/dgraph-io/gru/dgraph"
	"github.com/dgraph-io/gru/gruadmin/server"
	"github.com/dgraph-io/gru/gruadmin/tag"
	"github.com/gorilla/mux"
)

type Question struct {
	Uid      string `json:"_uid_"`
	Name     string
	Text     string
	Positive float64
	Negative float64
	Tags     []tag.Tag
	Options  []Option
}

type Option struct {
	Uid string `json:"_uid_"`
	// TODO - Change this to text later.
	Text      string `json:"name"`
	IsCorrect bool   `json:"is_correct"`
}

func add(q Question) string {
	m := `mutation {
		set {
		  <rootQuestion> <question> <_new_:qn> .
		  <_new_:qn> <name> "` + q.Name + `" .
		  <_new_:qn> <text> "` + q.Text + `" .
		  <_new_:qn> <positive> "` + strconv.FormatFloat(q.Positive, 'g', -1, 64) + `" .
		  <_new_:qn> <negative> "` + strconv.FormatFloat(q.Negative, 'g', -1, 64) + `" .`

	correct := 0
	for i, opt := range q.Options {
		idx := strconv.Itoa(i)
		m += `
		<_new_:qn> <question.option> <_new_:o` + idx + `> .
		<_new_:o` + idx + `> <name> "` + opt.Text + `" .`
		if opt.IsCorrect {
			m += `
			<_new_:qn> <question.correct> <_new_:o` + idx + `> .`
			correct++
		}
	}

	for i, t := range q.Tags {
		idx := strconv.Itoa(i)
		if t.Uid != "" {
			m += `
			<_new_:qn> <question.tag> <_uid_:` + t.Uid + `> .
			<_uid_:` + t.Uid + `> <tag.question> <_new_:qn> . `
		} else {
			m += `
			<_new_:t` + idx + `> <name> "` + t.Name + `" .
			<_new_:qn> <question.tag> <_new_:t` + idx + `> .
			<_new_:t` + idx + `> <tag.question> <_new_:qn> . `
		}
	}

	if correct > 1 {
		m += `
		<_new_:qn> <multiple> "true" . `
	} else {
		m += `
		<_new_:qn> <multiple> "false" . `
	}
	m += `
	  }
  }	`
	return m
}

// TODO - Move this inline with add, like we have for edit.
func validateQuestion(q Question) error {
	if q.Name == "" || q.Text == "" {
		return fmt.Errorf("Question name/text can't be empty")
	}
	// TODO - Have validation on score.
	if q.Positive == 0 || q.Negative == 0 {
		return fmt.Errorf("Positive or negative score can't be zero.")
	}
	if len(q.Options) == 0 {
		return fmt.Errorf("Question should have atleast one option")
	}
	correct := 0
	for _, opt := range q.Options {
		if opt.IsCorrect {
			correct++
		}
	}
	if correct == 0 {
		fmt.Errorf("Atleast one option should be correct")
	}
	return nil
}

// API for "Adding Question" to Database
func Add(w http.ResponseWriter, r *http.Request) {
	sr := server.Response{}
	var q Question
	err := json.NewDecoder(r.Body).Decode(&q)
	if err != nil {
		sr.Error = "Couldn't decode JSON"
		w.WriteHeader(http.StatusBadRequest)
		w.Write(server.MarshalResponse(sr))
		return
	}

	if err := validateQuestion(q); err != nil {
		sr.Error = err.Error()
		w.WriteHeader(http.StatusBadRequest)
		w.Write(server.MarshalResponse(sr))
		return
	}

	m := add(q)
	res, err := dgraph.SendMutation(m)
	if err != nil {
		sr.Write(w, "", err.Error(), http.StatusInternalServerError)
		return
	}
	if res.Code != "ErrorOk" {
		sr.Write(w, res.Message, "", http.StatusInternalServerError)
		return
	}

	sr.Success = true
	sr.Message = "Question Successfully Saved!"
	w.Write(server.MarshalResponse(sr))
}

type qid struct {
	Id string
}

func Index(w http.ResponseWriter, r *http.Request) {
	sr := server.Response{}
	var q qid
	err := json.NewDecoder(r.Body).Decode(&q)
	if err != nil {
		sr.Write(w, "", "Couldn't decode JSON", http.StatusBadRequest)
		return
	}

	var query string
	// TODO - Maybe dont call with debug, and request appropriate fields.
	if q.Id != "" {
		query = "{debug(_xid_: rootQuestion) { question (after: " + q.Id + ", first: 20) { _uid_ name text negative positive question.tag { name } question.option { name } question.correct { name } }  } }"
	} else {
		query = "{debug(_xid_: rootQuestion) { question (first:20) { _uid_ name text negative positive question.tag { name } question.option { name } question.correct { name } }  } }"
	}

	b, err := dgraph.Query(query)
	if err != nil {
		sr.Write(w, "", err.Error(), http.StatusInternalServerError)
		return
	}
	// TODO - Remove this stuff.
	jsonResp, _ := json.Marshal(string(b))
	w.Write(jsonResp)
}

type QuestionAPIResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	UIDS    struct {
		Question uint64 `json:question`
	}
}

// method to parse question response
func parseQuestionResponse(question_body []byte) (*QuestionAPIResponse, error) {
	var question_response = new(QuestionAPIResponse)
	err := json.Unmarshal(question_body, &question_response)
	if err != nil {
		log.Fatal(err)
	}
	return question_response, err
}

type TagFilter struct {
	UID string
}

// FILTER QUESTION HANDLER: Fileter By Tags
// TODO - Clean this up.
func Filter(w http.ResponseWriter, r *http.Request) {
	var tag TagFilter

	err := json.NewDecoder(r.Body).Decode(&tag)
	if err != nil {
		panic(err)
	}

	filter_query := "{root(_uid_: " + tag.UID + ") { tag.question { text }}"
	filter_response, err := http.Post("http://localhost:8080/query", "application/x-www-form-urlencoded", strings.NewReader(filter_query))
	if err != nil {
		panic(err)
	}
	defer filter_response.Body.Close()
	filter_body, err := ioutil.ReadAll(filter_response.Body)
	if err != nil {
		panic(err)
	}
	jsonResp, err := json.Marshal(string(filter_body))
	if err != nil {
		panic(err)
	}

	w.Write(jsonResp)
}

// get question information

func get(questionId string) string {
	return `
    {
        root(_uid_:` + questionId + `) {
		  _uid_
	  		name
          text
          positive
          negative
          question.option { _uid_ name }
          question.correct { _uid_ name }
          question.tag { _uid_ name }
        }
    }`
}

func Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	qid := vars["id"]

	q := get(qid)
	res, err := dgraph.Query(q)
	if err != nil {
		sr := server.Response{}
		sr.Write(w, "", err.Error(), http.StatusInternalServerError)
		return
	} // TODO - Check if Dgraph returns record not found and wrap it with an error.
	w.Write(res)
}

// update question
func edit(q Question) (string, error) {
	m := new(dgraph.Mutation)
	if q.Name == "" || q.Text == "" {
		return "", fmt.Errorf("Question name/text can't be empty.")
	}
	m.Set(`<_uid_:` + q.Uid + `> <name> "` + q.Name + `" .`)
	m.Set(`<_uid_:` + q.Uid + `> <text> "` + q.Text + `" .`)
	if q.Positive == 0 || q.Negative == 0 {
		return "", fmt.Errorf("Positive/Negative score can't be zero.")
	}
	m.Set(`<_uid_:` + q.Uid + `> <positive> "` + strconv.FormatFloat(q.Positive, 'g', -1, 64) + `" .`)
	m.Set(`<_uid_:` + q.Uid + `> <negative> "` + strconv.FormatFloat(q.Negative, 'g', -1, 64) + `" .`)

	correct := 0
	if len(q.Options) == 0 {
		return "", fmt.Errorf("Question should have atleast one option")
	}
	for _, opt := range q.Options {
		if opt.Text == "" {
			return "", fmt.Errorf("Option text can't be empty.")
		}
		m.Set(`<_uid_:` + opt.Uid + `> <name> "` + opt.Text + `" .`)
		m.Set(`<_uid_:` + q.Uid + `> <question.option> <_uid_:` + opt.Uid + `> . `)
		if opt.IsCorrect {
			correct++
			m.Set(`<_uid_:` + q.Uid + `> <question.correct> <_uid_:` + opt.Uid + `> .`)
		} else {
			m.Del(`<_uid_:` + q.Uid + `> <question.correct> <_uid_:` + opt.Uid + `> .`)
		}
	}

	// Create and associate Tags
	for i, t := range q.Tags {
		if t.Uid != "" && t.Is_delete {
			m.Del(`<_uid_:` + q.Uid + `> <question.tag> <_uid_:` + t.Uid + `> .`)
			m.Del(`<_uid_:` + t.Uid + `> <tag.question> <_uid_:` + q.Uid + `> . `)

		} else if t.Uid != "" {
			m.Set(`<_uid_:` + q.Uid + `> <question.tag> <_uid_:` + t.Uid + `> .`)
			m.Set(`<_uid_:` + t.Uid + `> <tag.question> <_uid_:` + q.Uid + `> . `)

		} else if t.Uid == "" {
			if t.Name == "" {
				return "", fmt.Errorf("Tag name can't be empty.")
			}
			idx := strconv.Itoa(i)
			m.Set(`<_new_:tag` + idx + `> <name> "` + t.Name + `" .`)
			m.Set(`<_uid_:` + q.Uid + `> <question.tag> <_new_:tag` + idx + `> .`)
			m.Set(`<_new_:tag` + idx + `> <tag.question> <_uid_:` + q.Uid + `> . `)
		}
	}
	// TODO - There should be atleast one tag associated with a question.

	if correct == 0 {
		return "", fmt.Errorf("Atleast one option should be correct.")
	} else if correct > 1 {
		m.Set(`<_uid_:` + q.Uid + `> <multiple> "true" . `)
	} else {
		m.Set(`<_uid_:` + q.Uid + `> <multiple> "false" . `)
	}
	return m.String(), nil
}

func Edit(w http.ResponseWriter, r *http.Request) {
	sr := server.Response{}
	// vars := mux.Vars(r)
	// qid := vars["id"]
	// TODO - Id should be obtained from url not the body.
	var q Question
	err := json.NewDecoder(r.Body).Decode(&q)
	if err != nil {
		sr.Write(w, "", "Couldn't decode JSON", http.StatusBadRequest)
		return
	}

	var m string
	if m, err = edit(q); err != nil {
		sr.Write(w, "", err.Error(), http.StatusBadRequest)
		return
	}

	mr, err := dgraph.SendMutation(m)
	if err != nil {
		sr.Write(w, "", err.Error(), http.StatusInternalServerError)
		return
	}
	if mr.Code != "ErrorOk" {
		sr.Write(w, mr.Message, "", http.StatusInternalServerError)
		return
	}

	sr.Success = true
	sr.Message = "Question updated successfully."
	w.Write(server.MarshalResponse(sr))
}

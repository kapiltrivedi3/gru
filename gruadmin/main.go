/*
 * Copyright 2016 DGraph Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * 		http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware"
	"github.com/dgraph-io/gru/auth"
	"github.com/dgraph-io/gru/dgraph"
	"github.com/dgraph-io/gru/gruadmin/candidate"
	"github.com/dgraph-io/gru/gruadmin/question"
	"github.com/dgraph-io/gru/gruadmin/quiz"
	"github.com/dgraph-io/gru/gruadmin/report"
	"github.com/dgraph-io/gru/gruadmin/server"
	"github.com/dgraph-io/gru/gruadmin/tag"
	quizp "github.com/dgraph-io/gru/gruserver/quiz"
	jwt "github.com/dgrijalva/jwt-go"
	"github.com/gorilla/mux"
	"github.com/urfave/negroni"
)

var (
	// TODO - Later just have one IP address with port info.
	port     = flag.String("port", ":8000", "Port on which server listens")
	username = flag.String("user", "", "Username to login to admin panel")
	password = flag.String("pass", "", "Username to login to admin panel")
)

func login(w http.ResponseWriter, r *http.Request) {
	sr := server.Response{}
	u, p, ok := r.BasicAuth()
	if !ok || u != *username || p != *password {
		sr.Write(w, "", "You are unuathorized", http.StatusUnauthorized)
		return
	}
	// TODO - Add relevant claims like expiry.
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{})

	tokenString, err := token.SignedString([]byte(*auth.Secret))
	if err != nil {
		sr.Write(w, err.Error(), "", http.StatusInternalServerError)
	}

	type Res struct {
		Token string `json:"token"`
	}

	res := Res{Token: tokenString}
	json.NewEncoder(w).Encode(res)
}

// Middleware for adding CORS headers and handling preflight request.
func options(rw http.ResponseWriter, r *http.Request, next http.HandlerFunc) {
	server.AddCorsHeaders(rw)

	if r.Method == "OPTIONS" {
		return
	}
	next(rw, r)
}

type healthCheck struct {
	Server bool `json:"server"`
	Dgraph bool `json:"dgraph"`
}

func health(w http.ResponseWriter, r *http.Request) {
	hc := healthCheck{Server: true}
	// Check Dgraph, send a mutation, do a query.
	m := new(dgraph.Mutation)
	m.Set(`<alice> <name> "Alice" .`)
	_, err := dgraph.SendMutation(m.String())
	if err != nil {
		json.NewEncoder(w).Encode(hc)
		return
	}

	res, err := dgraph.Query("{ \n me(_xid_:alice) { \n name \n } \n }")
	if err != nil || string(res) != `{"me":[{"name":"Alice"}]}` {
		json.NewEncoder(w).Encode(hc)
		return
	}
	hc.Dgraph = true
	json.NewEncoder(w).Encode(hc)
}

func runHTTPServer(address string) {
	jwtMiddleware := jwtmiddleware.New(jwtmiddleware.Options{
		ValidationKeyGetter: func(token *jwt.Token) (interface{}, error) {
			return []byte(*auth.Secret), nil
		},
		SigningMethod: jwt.SigningMethodHS256,
	})

	router := mux.NewRouter()
	router.HandleFunc("/api/admin/login", login).Methods("POST", "OPTIONS")
	router.HandleFunc("/api/healthcheck", health).Methods("GET")
	router.HandleFunc("/api/validate/{id}", candidate.Validate).Methods("POST", "OPTIONS")

	quizRouter := router.PathPrefix("/api/quiz").Subrouter()
	quizRouter.HandleFunc("/question", quizp.QuestionHandler).Methods("POST", "OPTIONS")
	quizRouter.HandleFunc("/answer", quizp.AnswerHandler).Methods("POST", "OPTIONS")
	quizRouter.HandleFunc("/ping", quizp.PingHandler).Methods("POST", "OPTIONS")

	admin := mux.NewRouter()
	router.PathPrefix("/api/admin").Handler(negroni.New(
		negroni.HandlerFunc(jwtMiddleware.HandlerWithNext),
		negroni.Wrap(admin),
	))

	adminRouter := admin.PathPrefix("/api/admin").Subrouter()
	// TODO - Change the API's to RESTful API's
	adminRouter.HandleFunc("/add-question", question.Add).Methods("POST", "OPTIONS")
	// TODO - Change to PUT.
	adminRouter.HandleFunc("/get-all-questions", question.Index).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/filter-questions", question.Filter).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/question/{id}", question.Get).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/question/{id}", question.Edit).Methods("PUT", "OPTIONS")

	adminRouter.HandleFunc("/add-quiz", quiz.Add).Methods("POST", "OPTIONS")
	// TODO - Change to PUT.
	adminRouter.HandleFunc("/get-all-quizes", quiz.Index).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/quiz/{id}", quiz.Get).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/quiz/{id}", quiz.Edit).Methods("PUT", "OPTIONS")

	adminRouter.HandleFunc("/get-all-tags", tag.Index).Methods("GET", "OPTIONS")

	adminRouter.HandleFunc("/candidate", candidate.Add).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/candidate/{id}", candidate.Edit).Methods("PUT", "OPTIONS")
	adminRouter.HandleFunc("/candidate/{id}", candidate.Get).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/candidate/report/{id}", report.Report).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/candidates", candidate.Index).Methods("GET", "OPTIONS")

	n := negroni.Classic()
	n.Use(negroni.HandlerFunc(options))
	n.UseHandler(router)
	fmt.Println("Server Running on 8000")
	log.Fatal(http.ListenAndServe(address, n))
}

func main() {
	rand.Seed(time.Now().UnixNano())
	flag.Parse()
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	runHTTPServer(*port)
}

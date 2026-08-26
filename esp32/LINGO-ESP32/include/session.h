#ifndef SESSION_H
#define SESSION_H

struct SessionData {
  String device_id;
  String user_id;
  String session_type;
  int total_question;
  int correct;
  int wrong;
  int accuracy;
  int duration;
};

#endif
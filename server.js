const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const shortid = require('shortid');
const moment = require('moment');
const Regex = require('regex');

const cors = require('cors');

const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI);

app.use(cors());

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});


// Not found middleware
/*app.use((req, res, next) => {
  return next({status: 404, message: 'not found'});
});*/

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || 'Internal Server Error';
  }
  res.status(errCode).type('txt')
    .send(errMessage);
});

//Define schemas and models
var Schema = mongoose.Schema;
var userSchema = new Schema({
  username: {
    type: String,
    required: true
  },
  _id: {
    type: String,
    default: shortid.generate
  }
});

var logSchema = new Schema({
  userId: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true
  }
});

var User = mongoose.model('User', userSchema);
var Log = mongoose.model('Log', logSchema);

//Get all users from the database
app.get('/api/exercise/users', function(req, res, next) {
  User.find({}, function(err, data) {
    var userMap = [];
    
    if(err) {
      return next(err);
    }
    
    data.forEach(function(user) {
      userMap.push(user);
    });
    
    res.send(userMap);
  });
});

//Create a new username
app.post('/api/exercise/new-user', function(req, res, next) {
  let re = new RegExp(/^[a-zA-Z0-9\-_]+$/);
  let thisNewUser = req.body.username.toLowerCase();
  if(!thisNewUser.match(re)) {
    res.json({error: 'Alphanumeric, hyphen, and underscore characters only (a-z, 0-9,-, _) with no spaces'})
  }
  if(thisNewUser.length < 3 || thisNewUser.length > 10) {
    res.json({error: 'Username length should be 3-10 characters long'});
  }
  User.findOne({'username': thisNewUser}, function(err, data) {
    if(err) {
      return next(err);
    }
    if(data) {
      //Username already exists in the database, return an error
      res.json({error: 'Username already exists, please choose another'});
    }
    else {
      //Username doesn't exist yet, so it is saved and the result is rendered
      let username = new User({username: thisNewUser});
      username.save(function(err, data) {
        if(err) {
          return next(err);
        }
        //Render the newly created username and it's id
        res.json({username: data.username, _id: data._id});
      });
    }
  });
});

app.get('/api/exercise/log', function(req, res, next) {
  let query = req.query;
  let userId = query.userId;
  let fromDate = query.from;
  let toDate = query.to;
  let limit = query.limit;
  
  //Ensure a userId is entered into the query string 
  if(!userId) {
    res.send('Please enter a userId in the query string');
  }
  
  let username = '';
  User.findOne({_id: userId}, function(err, data) {
    if(err) {
      return next(err);
    }
    username = data.username;
  });
  
  Log.find({userId: userId, date: {$gt: fromDate, $lt: toDate}}, function(err, data) {
    if(err) {
      return next(err);
    }
    if(!data) {
      res.send('UserId data cannot be found');
    }
    else {
      let logArr = [];
      let recordCount = data.length;
      if(!limit) {
        limit = recordCount;
      }
      
      //Iterate results up to the limit or the total number of records
      for(let i = 0; i < limit; i++) {
        
        //Format date to ddd MMM DD, YYYY (Sun Jan 03, 2015)
        let formattedDate = moment(data[i].date).format('ddd MMM DD, YYYY');
        
        //Trim userId from every log returned result
        let logDetails = {
          description: data[i].description,
          duration: data[i].duration,
          date: formattedDate
        };
        logArr.push(logDetails);
      }
    
      //Render results
      res.json({_id: userId, username: username, from: fromDate, to: toDate, totalRecords: recordCount, recordLimit: limit, log: logArr});
    }
  }).sort({date: 'desc'});
  
});

//Add an exercise to a user's log
app.post('/api/exercise/add', function(req, res, next) {
  let userId = req.body.userId;
  let userDesc = req.body.description;
  let userDuration = req.body.duration;
  let userDate = req.body.date;
  let date = '';
  let re = new RegExp(/^(20[01]\d{1})\-(0?[1-9]|1[012])\-(0?[1-9]|[12][0-9]|3[01])$/);
  
  //Use today's date if user doens't enter a date
  if(userDate == '') {
    date = new Date();
  }
  else {
    //If entered, ensure date matches format YYYY-MM-DD or send an error
    if(!userDate.match(re)) {
      res.send('Please enter date in the YYYY-MM-DD format');
    }
    else {
      date = new Date(userDate);
    }
  }
  
  User.findOne({'_id': userId}, function(err, data) {
    if(err) {
      return next(err);
    }
    if(!data) {
      res.send("Can't find that userId");
    }
    else {
      let username = data.username;
      let logEntry = new Log({userId: data._id, description: userDesc, duration: userDuration, date: date});
      logEntry.save(function(err, data) {
        if(err) {
          return next(err);
        }
        let formattedDate = moment(data.date).format('ddd MMM DD, YYYY');
        res.json({userId: username, description: data.description, duration: data.duration, date: formattedDate});
      });
    }
  });
  
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
});
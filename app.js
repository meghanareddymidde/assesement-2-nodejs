const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  console.log(hashedPassword);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUser = `
            INSERT INTO user(username,password,name,gender)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );
            `;
      const dbResponse = await db.run(createUser);
      const userId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Twitter");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Twitter", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/profile/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  response.send(userDetails);
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getTweets = `
    SELECT user.username AS username,
    tweet.tweet As tweet,
    tweet.date_time As dateTime 
    FROM  (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id)
    AS T INNER JOIN user ON T.user_id = user.user_id  
    WHERE follower.follower_user_id = ${loggedInUser.user_id}
    ORDER BY dateTime DESC 
    LIMIT 4 
    OFFSET 0;
    `;
  const tweetsArray = await db.all(getTweets);
  response.send(tweetsArray);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getFollowingName = `
  SELECT user.name FROM user INNER JOIN follower 
  ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${loggedInUser.user_id};
  `;
  const namesArray = await db.all(getFollowingName);
  response.send(namesArray);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getFollowersNames = `
     SELECT user.name FROM user INNER JOIN follower 
     ON user.user_id = follower.follower_user_id
     WHERE follower.following_user_id = ${loggedInUser.user_id};
     `;
  const namesArray = await db.all(getFollowersNames);
  response.send(namesArray);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);

  const getFollowingUserTweets = `
  SELECT tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply) AS replies,
  tweet.date_time AS dateTime
  FROM ((tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
  INNER JOIN like ON T.tweet_id = like.tweet_id) AS F INNER JOIN follower 
  ON F.user_id = follower.following_user_id
  WHERE tweet.tweet_id = ${tweetId} AND 
  follower.follower_user_id = ${loggedInUser.user_id};
  `;
  const tweets = await db.get(getFollowingUserTweets);
  if (tweets.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweets);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
    const loggedInUser = await db.get(getLoggedInUserId);

    const getLikedUsers = `
  SELECT user.username
  FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id 
  INNER JOIN user ON tweet.user_id = user.user_id 
  INNER JOIN follower ON user.user_id = follower.following_user_id 
  WHERE tweet.tweet_id = ${tweetId} AND 
  follower.follower_user_id = ${loggedInUser.user_id};
  `;
    const users = await db.all(getLikedUsers);
    //console.log(users);
    if (users === "") {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: users.map((each) => each.username) });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
    const loggedInUser = await db.get(getLoggedInUserId);

    const getUserReplies = `
    SELECT user.name, reply.reply 
    FROM user INNER JOIN reply ON user.user_id = reply.user_id 
    INNER JOIN tweet ON reply.user_id = tweet.user_id 
    INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE tweet.tweet_id = ${tweetId} AND 
    follower.follower_user_id = ${loggedInUser.user_id};
    `;
    const replies = await db.all(getUserReplies);
    const userReplies = { replies: replies };
    if (userReplies.replies === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(userReplies);
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getUserTweets = `
  SELECT tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply) AS replies,
  tweet.date_time AS dateTime
  FROM ((tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
  INNER JOIN like ON T.tweet_id = like.tweet_id)
  WHERE tweet.user_id = ${loggedInUser.user_id};
  `;
  const userTweets = await db.all(getUserTweets);
  response.send(userTweets);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const createTweet = `
    INSERT INTO tweet(tweet) 
    VALUES ('${tweet}');
    `;
  await db.run(createTweet);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
    const loggedInUser = await db.get(getLoggedInUserId);
    //console.log(loggedInUser);

    const deleteTweet = `
    DELETE FROM tweet  
    WHERE tweet_id = ${tweetId} AND 
    user_id = ${loggedInUser.user_id}; 
    `;
    const deletedTweet = await db.run(deleteTweet);
    if (deletedTweet.lastID !== 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;

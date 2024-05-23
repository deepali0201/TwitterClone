const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const intialize = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server is Running at http://localhost:3000/'),
    )
  } catch (e) {
    console.log(`db error ${e.message}`)
    process.exit(1)
  }
}
intialize()

//API 1

app.post('/register/', async (request, response) => {
  const {username, password, gender, name} = request.body
  const dbUser = await db.get(
    `SELECT * FROM user WHERE username= '${username}';`,
  )
  if (dbUser === undefined) {
    if (password.length > 6) {
      const hashedPassword = await bcrypt.hash(password, 10)
      await db.run(`
      INSERT INTO
      user (username, password, gender, name)
    VALUES(
        '${username}',
        '${password}',
        '${gender}',
        '${name}'
      );`)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password, gender, name} = request.body
  const dbUser = await db.get(
    `SELECT * FROM user WHERE username= '${username}';`,
  )
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(oldPassword, dbUser.password)
    if (isPasswordMatched) {
      let jwtToken = jwt.sign(username, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

function authenticationToken(request, response, next) {
  let jwtToken

  const authorization = request.body['authorization']
  if (authorization !== undefined) {
    jwtToken = authorization.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload
        next()
      }
    })
  }
}

const tweetResponse = dbObject => ({
  username: dbObject.username,
  tweet: dbObject.tweet,
  dateTime: dbObject.date_time,
})
//API 3

app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    const latestTweet = await db.all(
      `SELECT 
    tweet.tweet_id,
    tweet.user_id,
    user.username,
    tweet.tweet,
    tweet.date_time
    from
    follower
    left join tweet on tweet.user_id=follower.following_user_id
    left join user on follower.following_user_id=user.user_id
    where follower.following_user_id=(select user_id from user where username='${request.username}')
    order by tweet.date_time desc
    limit 4;
    `,
    )
    response.send(latestTweet.map(item => tweetResponse(item)))
  },
)

//API 4

app.get('/user/following/', authenticationToken, async (request, response) => {
  const following = await db.all(
    `
    SELECT 
    user.name
    from
    follower
    left join user on follower.following_user_id=user.user_id
    where follower.following_user_id=(select user_id from user where username='${request.username}')
    `,
  )
  response.send(following)
})

//API 5

app.get('/user/followers/', authenticationToken, async (request, response) => {
  const followers = await db.all(
    `
    SELECT 
    user.name
    from
    follower
    left join user on follower.following_user_id=user.user_id
    where follower.following_user_id=(select user_id from user where username='${request.username}')
    `,
  )
  response.send(followers)
})

const follows = async (request, response, next) => {
  const {tweetId} = request.params
  let following = await db.get(`
  SELECT * from follower
  where follower.following_user_id=(select user_id from user where username='${request.username}')
  and 
  following_user_id=(select user.user_id from tweet natural join user where tweet_id='${tweetId}')
`)
  if (following === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 6

app.get(
  '/tweets/:tweetId/',
  authenticationToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const {tweet, date_time} = await db.get(`
    select tweet.date_time from tweet where tweet_id='${tweetId}';`)
    const {likes} = await db.get(`
    select count(like_id) as likes from like where tweet_id='${tweetId}';`)
    const {replies} = await db.get(`
    select count(reply_id) as replies from reply where tweet_id='${tweetId}';`)
    response.send({tweet, likes, replies, dateTime: date_time})
  },
)

//API 7

app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const likedBy = await db.all(`
  select user.username from like natural join user where tweet_id='${tweetId}';`)
    response.send({likes: likedBy.map(item => item.username)})
  },
)

//API 8

app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  follows,
  async (request, response) => {
    const {tweetId} = request.params
    const replies = await db.all(`
  SELECT user.name,reply.reply from reply natural join user
  where tweet_id ='${tweetId}
  `)
    response.send({replies})
  },
)

//API 9

app.get('/user/tweets/', authenticationToken, async (request, response) => {
  const myTweets = await db.all(`
  SELECT
  tweet.tweet,
  count(distinct like.like_id) as likes,
  count(distinct reply.reply_id) as replies,
  tweet.date_time
  from tweet 
  left join like on tweet.tweet_id=like.tweet_id
  left join reply on tweet.tweet_id=reply.tweet_id
  where tweet.user_id=(select user_id from user where username='${request.username}')
  group by tweet.tweet_id
  `)
  response.send(
    myTweets.map(item => {
      const {date_time, ...rest} = item
      return {...rest, dateTime: date_time}
    }),
  )
})

//API 10

app.post('/user/tweets/', async (request, response) => {
  const {tweet} = request.body
  const {user_id} = await db.get(`
  SELECT user_id from user where username='${request.username}'
  `)
  await db.run(`
    INSERT INTO
      tweet (tweet,user_id)
    VALUES(
        '${tweet}',
         ${user_id}
      );`)
  response.send('Created a Tweet')
})

//API 11

app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const userTweet = await db.get(`
  select tweet_id, user_id
  from 
  tweet
  where tweet_id='${tweetId}'
  and user_id=(select user_id from user where username='${request.username}')
  `)
    if (userTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      await db.run(`
    DELETE FROM
      tweet
    WHERE
      tweet_id = ${tweetId};`)

      response.send('Tweet Removed')
    }
  },
)

module.exports = app

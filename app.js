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

function authenticationToken(request, response, next) {
  let jwtToken

  const authorization = request.headers['authorization']
  if (authorization) {
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
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}

// const tweetResponse = dbObject => ({
//   username: dbObject.username,
//   tweet: dbObject.tweet,
//   dateTime: dbObject.date_time,
// })

const twwetAccessVerifivation = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
  SELLECT * from tweet INNER JOIN follower
  on tweet.user_id=follower.following_user_id
  where tweet.tweet_id='${tweetId}' and follower_user_id='${userId}'`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const dbUser = await db.get(
    `SELECT * FROM user WHERE username= '${username}';`,
  )
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      await db.run(`
      INSERT INTO
      user (name, username, password, gender)
    VALUES(
        '${name}',
        '${username}',
        '${hashedPassword}',
        '${gender}'
      );`)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const dbUser = await db.get(
    `SELECT * FROM user WHERE username= '${username}';`,
  )
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const payload = {username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(username, 'MY_SECRET_KEY')
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

//API 3

app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    const {username} = request
    const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)
    const getTweedFeedQuery = await db.all(
      `SELECT 
    username,tweet,date_time as datetime 
    from
    user Inner Join tweet on 
    user.user_id=tweet.user_id where 
    user.user_id='${userId}'
    order by dateTime desc 
    limit 4;
    `,
    )
    response.send(getTweedFeedQuery)
  },
)

//API 4

app.get('/user/following/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const following = await db.all(
    `
    SELECT 
    name
    from
    follower
    inner join user on user.user_id =follower.following_user_id
    where follower_user_id='${username}'
    `,
  )
  response.send(following)
})

//API 5

app.get('/user/followers/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const followers = await db.all(
    `
    SELECT 
    DISTINCT name
    from
    user
    inner join follower on user.user_id =follower.following_user_id
    where following_user_id='${username}'
    `,
  )
  response.send(followers)
})

// const follows = async (request, response, next) => {
//   const {tweetId} = request.params
//   let following = await db.get(`
//   SELECT * from follower
//   where follower.following_user_id=(select user_id from user where username='${request.username}')
//   and
//   following_user_id=(select user.user_id from tweet natural join user where tweet_id='${tweetId}')
// `)
//   if (following === undefined) {
//     response.status(401)
//     response.send('Invalid Request')
//   } else {
//     next()
//   }
// }

//API 6

app.get(
  '/tweets/:tweetId/',
  authenticationToken,
  twwetAccessVerifivation,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const tweetQuerry = await db.get(`
    select tweet,(select count() from like where tweet_id='${tweetId}') as likes,
    (select count() from reply where tweet_id='${tweetId}') as replies,
    date_time as dateTime
    from tweet 
    where tweet.tweet_id='${tweetId}'
    `)
    response.send(tweetQuerry)
  },
)

//API 7

app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  twwetAccessVerifivation,
  async (request, response) => {
    const {tweetId} = request.params

    const likedBy = await db.all(`
  select username from user inner join like on
  user.user_id=like.user_id where tweet_id='${tweetId}';`)
    response.send({likes: likedBy.map(item => item.username)})
  },
)

//API 8

app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  twwetAccessVerifivation,
  async (request, response) => {
    const {tweetId} = request.params

    const replies = await db.all(`
  SELECT name,reply from user inner join reply on
  user.user_id=reply.user_id
  where tweet_id ='${tweetId}
  `)
    response.send({replies})
  },
)

//API 9

app.get('/user/tweets/', authenticationToken, async (request, response) => {
  const {userId} = request
  const myTweets = await db.all(`
  SELECT
  tweet,
  count(distinct like_id) as likes,
  count(distinct reply_id) as replies,
  date_time as dateTime
  from tweet 
  left join reply on tweet.tweet_id=reply.tweet_id
  left join like on tweet.tweet_id=like.tweet_id
  where tweet.user_id=_id ='${userId}')
  group by tweet.tweet_id
  `)
  response.send(myTweets)
})

//API 10

app.post('/user/tweets/', async (request, response) => {
  const {tweet} = request.body
  const {userId} = parseInt(request.user_id)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const postTweetQuery = await db.run(`
  INSERT INTO
      tweet (tweet,user_id,date_time)
    VALUES(
        '${tweet}',
        '${user_id}',
        '${dateTime}'
      );
  `)
  response.send('Created a Tweet')
})

//API 11

app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const userTweet = await db.get(`
  select *
  from 
  tweet
  where user_id ='${userId}' and  tweet_id='${tweetId}'
  and user_id=(select user_id from user where username='${request.username}')
  `)
    if (userTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = await db.run(`
    DELETE FROM
      tweet
    WHERE
      tweet_id = '${tweetId}';`)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app

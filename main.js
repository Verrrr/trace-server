const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const secretKey = "traceme";
const cors = require('cors');

app.use(bodyParser.json());
app.use(cors({origin: "http://localhost:8100",credentials: true}));

// Users online
var users = [];

//Create server using express
var server = app.listen(8080, ()=>{
    console.log("server started on port 8080");
});

//Create instance of socket.io on same port of express server
var io = require('socket.io').listen(server);

io.on('connection',(socket)=>{

    socket.on('setId', id => {
        users[id] = socket.id;
        socket.user_id = id;
        console.log(`user[${id}] is set to ${socket.id}`);
    });

});

console.clear();

//Create Connection
const conn = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'db_trace'
  });

//Connect to database
conn.connect();

app.post('/sign-up', (req,res)=>{

    let hash = bcrypt.hashSync(req.body.user.password, 10);

    let sql = ` INSERT INTO user SET
    firstname = '${req.body.user.firstname}',
    lastname = '${req.body.user.lastname}',
    middlename = '${req.body.user.firstname}',
    password = '${hash}',
    email = '${req.body.user.email}'`;

    conn.query(sql, (err,result)=> {
        if(err) throw err;
        res.setHeader('Content-type','Application/json');
        let user = {
            user_id : result.insertId,
            email: req.body.email,
            firstname: req.body.user.firstname,
            lastname: req.body.user.lastname,
            middlename: req.body.user.middlename,
            isPremium: false
        };
        const token = jwt.sign({user},secretKey);
        res.json({token});
    });
    
});

function verifyToken(req,res,next){
    res.setHeader('Content-type','Application/json');
    const bearerHeader = req.headers['authorization'];
    if(bearerHeader !== 'undefined'){
        const bearerToken = bearerHeader.split(' ')[1];
        jwt.verify(bearerToken,secretKey , (err,result) =>{
            if(err){
                res.status(403).json({message: err.message});
            } else {
                req.token = result;
                next();
            }
        });
    } else {
        res.status(403).json({message: "Token missing from header"});
    }
}

app.post('/login',(req,res)=>{
    res.setHeader('Content-type','Application/json');
    let sql = `SELECT * FROM user WHERE email = '${req.body.email}'`;
    conn.query(sql, (err,result)=>{
        if (err) throw err;
        if(result.length == 1){
            if(bcrypt.compareSync(req.body.password, result[0].password)){
                let user = {
                    user_id : result[0].user_id,
                    email: result[0].email,
                    firstname: result[0].firstname,
                    lastname: result[0].lastname,
                    middlename: result[0].middlename,
                    isPremium: result[0].isPremium
                };
                const token = jwt.sign({user},secretKey);
                res.json({token});
            } else {
                res.status(400).json({message: "Invalid username/password"});
            }
        } else {
            res.status(400).json({message:"Invalid username/password"});
        }
    });
});

app.post('/contacts',verifyToken,(req,res)=>{

    let sql = `SELECT user_id FROM user WHERE email = ?`;
    
    conn.query(sql, [req.body.email], (err,result) => {
        if (err) throw err;
        if(result.length == 1){

            const notification = [result[0].user_id,1,req.token.user.user_id];

            sql = "INSERT INTO user_notification(user_id,notification_type_id,from_user_id) VALUES (?) ";
            
            let query = conn.query(sql, [notification], (err,result2)=>{
                if(err) throw err;

                if(users[result[0].user_id] !== undefined){
                    io.to(users[result[0].user_id])
                    .emit('new notification',{notification: "someone wants to add you"});
                }

                res.json({message: 'Request successful'});
            });

        } else {
            res.status(422).json({message: 'email not recognized'});
        }
    });



});

app.get('/contacts',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM contacts WHERE user_id = ?";

    conn.query(sql, [req.token.user.user_id], (err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});

app.get('/notification',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM user_notification WHERE user_id = ?";

    conn.query(sql, [req.token.user.user_id], (err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});

app.get('/user/:id',verifyToken,(req,res)=>{
    let sql = "SELECT user_id,email,firstname,lastname,middlename FROM user WHERE user_id = ?";

    conn.query(sql,[req.params.id],(err,result)=>{
        if(err) throw err;
        res.json(result[0]);
    });
});



app.get('/notification-type/:id',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM notification_type WHERE notification_type_id = ?";

    conn.query(sql,[req.params.id],(err,result)=>{
        if(err) throw err;
        res.json(result[0]);
    });
});

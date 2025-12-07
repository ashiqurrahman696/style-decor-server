require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const port = process.env.PORT || 3000;
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8');
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(cors());
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
    const token = req?.headers?.authorization?.split(' ')[1];
    console.log(token);
    if (!token) return res.status(401).send({ message: 'Unauthorized Access!' });
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.tokenEmail = decoded.email;
        console.log(decoded);
        next();
    } catch (err) {
        console.log(err);
        return res.status(401).send({ message: 'Unauthorized Access!', err });
    }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});
async function run() {
    try {
        const db = client.db("style_decors_db");
        const usersCollection = db.collection("users");
        const servicesCollection = db.collection("services");

        const verifyAdmin = async(req, res, next) => {
            const email = req.tokenEmail;
            const query = {email};
            const user = await usersCollection.findOne(query);
            if(!user || user.role !== "admin"){
                return res.status(403).send({message: "Forbidden access"});
            }
            next();
        }

        // user apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const adminEmail = req.tokenEmail;
            const result = await usersCollection.find({ email: { $ne: adminEmail } }).toArray();
            res.send(result);
        });

        app.get('/user/role', verifyJWT, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.tokenEmail })
            res.send({ role: result?.role })
        })

        app.post("/users", async(req, res) => {
            const user = req.body;
            const query = {};
            user.role = "user";
            user.createdAt = new Date().toISOString();
            user.lastLogin = new Date().toISOString();
            if(user.email){
                query.email = user.email;
            }

            const userExists = await usersCollection.findOne(query);
            if(userExists){
                const updatedResult = await usersCollection.updateOne(query, {
                    $set: {
                        last_loggedIn: new Date().toISOString(),
                    },
                });
                return res.send(updatedResult);
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch("/user/:id/role", verifyJWT, verifyAdmin, async(req, res) => {
            const {id} = req.params;
            const {role} = req.body;
            const query = {_id: new ObjectId(id)};
            const updatedDoc = {
                $set: {
                    role: role
                }
            };
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // decoration services apis
        app.get("/services", verifyJWT, verifyAdmin, async(req, res) => {
            const result = await servicesCollection.find().toArray();
            res.send(result);
        });

        app.post("/services", verifyJWT, verifyAdmin, async(req, res) => {
            const service = req.body;
            const result = await servicesCollection.insertOne(service);
            res.send(result);
        });

        app.patch("/services/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const {id} = req.params;
            const query = {_id: new ObjectId(id)};
            const updatedService = req.body;
            const update = {
                $set: updatedService
            }
            const result = await servicesCollection.updateOne(query, update);
            res.send(result);
        });

        app.delete("/services/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const {id} = req.params;
            const query = {_id: new ObjectId(id)};
            const result = await servicesCollection.deleteOne(query);
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. You successfully connected to MongoDB!');
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from Server..');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hy1k9.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, 'shhhhh', function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next(); // bar
    });
}
async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }

        }

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            // const authorization = req.headers.authorization;
            // console.log('auth header', authorization);
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        });

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })


        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });


        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // const user = req.body;
            const filter = { email: email };
            // const options = { upsert: true };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            // const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send(result);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });


        })


        /**
         * API Naming Convention
         * app.get('/booking')    get all bookings in this collection or get more than one or by filter
         * app.get('/booking/:id')  get a specific booking
         * app.post('/booking') add new booking
         * app.patch('/booking/:id) updating
         * app.put('booking/:id') upserting ==> update (if exists) or insert (if doesn't exist)
         * app.delete('/booking/:id') updating
         */

        // app.post('/booking', async (req, res) => {
        //     const booking = req.body;
        //     const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
        //     const exists = await bookingCollection.findOne(query);
        //     if (exists) {
        //         return res.send({ success: false, booking: exists })
        //     }
        //     const result = await bookingCollection.insertOne(booking);
        //     return res.send({ success: true, result })

        // })
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }

            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        });
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        });

        // app.post('/create-payment-intent', verifyJWT, async (req, res) => {
        //     const service = req.body;
        //     const price = service.price;
        //     const amount = price * 100;
        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: 'usd',
        //         payment_method_types: ['card']
        //     });
        //     res.send({ clientSecret: paymentIntent.client_secret })
        // });

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        // app.get('/available', async (req, res) => {
        //     const date = req.query.date || 'May 11, 2022';
        //     // step 1: get all services

        //     const services = await servicesCollection.find().toArray();

        //     // step 2: get the booking of that day
        //     const query = { date: date };
        //     const bookings = await bookingCollection.find(query).toArray();

        //     // step 3: for each service, find bookings for that service
        //     // services.forEach(service => {
        //     //     const serviceBookings = bookings.filter(b => b.treatment === service.name);
        //     //     const booked = serviceBookings.map(s => s.slot);
        //     //     // service.booked = booked
        //     //     // service.booked = serviceBookings.map(s => s.slot);
        //     //     const available = service.slots.filter(s => !booked.includes(s));
        //     //     service.available = available

        //     // })

        //     res.send(bookings);
        // })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 20, 2022';

            // step 1:  get all services
            const services = await servicesCollection.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service, find bookings for that service
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{},{},{},{}....]
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '','','']
                const booked = serviceBookings.map(s => s.slot)
                // step 6: select those slots that are not in bookedSlots
                // service.booked = booked
                const available = service.slots.filter(s => !booked.includes(s))
                // step 7: set available to slots to make it easier
                service.slots = available
            })

            res.send(services);
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello From Doctor Uncle!!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})
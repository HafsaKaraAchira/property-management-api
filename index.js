const express = require('express');
const bodyParser = require('body-parser'); // Middleware for parsing request bodies
const mongoose = require('mongoose');
const cors = require('cors'); // Import cors package

const app = express();

// Enable CORS for all origins (development only)
app.use(cors({ origin: true })); // Change to specific origin(s) for production

const port = 3033;

const MAX_RETRIES = 3; // Maximum number of retries for ID generation

const crypto = require('crypto');

function generateId() {
    return crypto.randomBytes(16).toString('hex'); // Generates a unique alphanumeric string
}

// Database connection (replace with your connection string)
const mongoURI = 'mongodb://localhost:27017/property_management';
mongoose.connect(mongoURI) // { useNewUrlParser: true, useUnifiedTopology: true }
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Property model
const PropertySchema = new mongoose.Schema({
    _id: {
        type: String,
        // required: true,
        // unique: true
    },
    address: {
        type: String,
        // required: true
    },
    rentalCost: {
        type: mongoose.Schema.Types.Mixed,
        // required: true
    },
    propertyName: {
        type: String,
        // required: true
    },
    tag: {
        type: String,
        // required: true
    },
    contractStartDate: {
        type: Date,
        // required: true
    },
    contractEndDate: {
        type: Date
    },
    directCost: {
        type: mongoose.Schema.Types.Mixed,
        // required: true
    },
    group: { // Status of the property (e.g., Exited, Full Property List, Pending)
        type: String,
        required: true
    },
    city: {
        type: String,
        // required: true
    },
    fixedCost: {
        type: Number,
        // required: true
    }
});


const Property = mongoose.model('Property', PropertySchema, 'properties');

// Body parser middleware (parses incoming JSON data)
app.use(bodyParser.json());

app.get('/api/properties', async(req, res) => {
    const { searchTerm } = req.query;

    try {
        let query = {}; // Initialize empty query object

        if (searchTerm) {
            // Case-insensitive search using regular expression with word boundaries
            // query = { $text: { $search: new RegExp(`.${searchTerm}.`, "i") } }; // Matches any character with searchTerm in between
            query = {
                $text: { $search: searchTerm }, // Use full-text search with $text operator
            };
        }
        // const properties = await Property.find(query, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } }); // Sort by text score
        const properties = await Property.find(query);
        console.log(`property query ${searchTerm}`);
        res.json(properties);
    } catch (err) {
        console.error('/api/properties error:', err);
        res.status(500).send('Error retrieving properties');
    }
});


// GET /properties/groups - Retrieve all properties grouped by their status (using aggregation)
app.get('/properties/groups', async(req, res) => {
    try {
        const groupedProperties = await Property.aggregate([
            { $group: { _id: '$group', properties: { $push: '$$ROOT' } } }
        ]);
        res.json(groupedProperties.reduce((acc, group) => {
            acc[group._id] = group.properties;
            return acc;
        }, {}));
        console.log(`properties retrieved`);
    } catch (err) {
        console.error('/properties/groups error:', err);
        res.status(500).send('Error retrieving grouped properties');
    }
});

// GET /properties/:id - Retrieve a specific property by ID
app.get('/properties/:id', async(req, res) => {
    const { id } = req.params;
    try {
        const property = await Property.findById(id);
        if (property) {
            res.json(property);
        } else {
            res.status(404).send('Property not found');
        }
    } catch (err) {
        console.error(`/properties/${id} error:`, err);
        res.status(500).send('Error retrieving property');
    }
});

async function createPropertyWithRetry(propertyData) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const newProperty = {
            _id: generateId(),
            ...propertyData,
        };
        console.log(newProperty);
        try {
            const savedProperty = await Property.create(newProperty);
            return savedProperty;
        } catch (error) {
            if (error.code !== 11000) { // Not a duplicate key error, re-throw
                throw error;
            }
            console.log(`Duplicate ID detected on attempt ${attempt}. Retrying...`);
        }
    }

    throw new Error('Failed to create property after retries'); // All retries failed
}

app.post('/properties', async(req, res) => {
    try {
        const savedProperty = await createPropertyWithRetry(req.body);
        res.status(201).json(savedProperty);
        console.log(`property added with ID: ${savedProperty.id}`);
    } catch (error) {
        console.error('/properties POST error:', error);
        res.status(error.code || 500).json({ message: error.message || 'Error creating property' });
    }
});


// PUT /properties/:id - Update an existing property (only group)
app.put('/properties/:id', async(req, res) => {
    const { id } = req.params;
    const { group } = req.body; // Only accept and update the "group" property

    try {
        const updatedProperty = await Property.findByIdAndUpdate(
            id, { $set: { group } }, // Use $set modifier to update only "group"
            { new: true } // Return the updated property
        );
        if (updatedProperty) {
            res.json(updatedProperty);
            console.log(`property group switched`);
        } else {
            res.status(404).send('Property not found');
        }
    } catch (err) {
        console.error(`/properties/${id} PUT error:`, err);
        res.status(400).send('Error updating property'); // Adjust based on specific error type
    }
});

// DELETE route to delete a property by ID
app.delete('/api/properties/:id', async(req, res) => {
    const { id } = req.params;
    try {
        const deletedProperty = await Property.findByIdAndDelete(id); // Use findByIdAndDelete

        if (deletedProperty) {
            res.json({ message: 'Property deleted successfully' });
        } else {
            res.status(404).json({ message: 'Property not found' });
        }
    } catch (err) {
        console.error(`/api/properties/${id} error:`, err);
        res.status(500).send('Error deleting property');
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

// // GET /properties - Retrieve all properties
// app.get('/properties', async(req, res) => {
//     try {
//         const properties = await Property.find();
//         res.json(properties);
//     } catch (err) {
//         console.error('/properties error:', err);
//         res.status(500).send('Error retrieving properties');
//     }
// });


// // POST /properties - Create a new property
// app.post('/properties', async(req, res) => {
//     const newProperty = req.body;
//     try {
//         const savedProperty = await Property.create(newProperty);
//         res.json(savedProperty);
//         console.log(`property added`);
//     } catch (err) {
//         console.error('/properties POST error:', err);
//         res.status(400).send('Error creating property'); // Adjust based on specific error
//     }
// });

// // PUT /properties/:id - Update an existing property
// app.put('/properties/:id', async(req, res) => {
//     const { id } = req.params;
//     const updatedProperty = req.body;
//     try {
//         const updatedDoc = await Property.findByIdAndUpdate(id, updatedProperty, { new: true }); // Return updated document
//         if (updatedDoc) {
//             res.json(updatedDoc);
//         } else {
//             res.status(404).send('Property not found');
//         }
//     } catch (err) {
//         console.error(`/properties/${id} PUT error:`, err);
//         res.status(400).send('Error updating property'); // Adjust based on specific error
//     }
// });

// // DELETE /properties/:id (optional, implement with caution!)
// app.delete('/properties/:id', async(req, res) => {
//             const { id } = req.params;
//             try {
//                 await Property.findByIdAndDelete(id);
//                 res.json({ message: 'Property deleted' });
//             } catch (err) {
//                 console.error(`/properties/${id} DELETE error:`, err);
//                 res.status(500).send('Error deleting property')
//             }); res.status(500).send('Error deleting property')
//             });
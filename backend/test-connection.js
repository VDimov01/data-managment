require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const db = require('./db'); // Assuming db.js exports the database connection


async function insertIntoTable(){
    const uuid = uuidv4();
    const maker = 'Dongfeng';
    const model = 'E3 BOX/NANO';
    const date = '2025-07-01';
    const engine = 'Електрически';
    const power_hp = 95;
    const euro_standard = 'Euro 6';
    const engine_capacity_cc = 1500;
    const transmission = 'Automatic';
    const category = 'Хечбек';
    const mileage_km = 10;
    const color = 'Червен';
    const vin = 'LDP43A960SS086594';
    const gps_tracking = true;
    const adaptive_headlights = false;
    const abs = true;
    const rear_airbags = true;
    const front_airbags = true;
    const side_airbags = true;
    const ebd = true;
    const esp = true;

    try {
        const connection = await mysql.createConnection(process.env.DATABASE_URL);
        console.log('✅ Connected to MySQL');


        // Example insert operation
        const insertQuery = 'INSERT INTO cars_test (maker, model, production_date, engine, power_hp, euro_standard, engine_capacity_cc,transmission, category, mileage_km, color, vin,gps_tracking, adaptive_headlights, abs, rear_airbags,front_airbags, side_airbags, ebd, esp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const insertValues = [maker, model, date, engine, power_hp, euro_standard, engine_capacity_cc,
    transmission, category, mileage_km, color, vin, gps_tracking, adaptive_headlights, abs, rear_airbags, front_airbags, side_airbags, ebd, esp];

        await connection.execute(insertQuery, insertValues);
        console.log('✅ Insert operation successful');
        // Example select operation to verify insert
        const [rows] = await connection.query('SELECT * FROM cars_test');
        console.log('🔍 Data from `test` table:', rows);

        await connection.end();
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    }
}

async function testConnection() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('✅ Connected to MySQL');

    await connection.query('ALTER TABLE offers MODIFY admin_id VARCHAR(50);');

    await connection.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

async function deleteTable() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('✅ Connected to MySQL');

    await connection.query("ALTER TABLE cars_test DROP COLUMN color;");

    await connection.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}


async function createTable(){
    try {
        const createTableQuery = `
ALTER TABLE cars
ADD COLUMN drive_type VARCHAR(50),
ADD COLUMN front_suspension_type VARCHAR(100),
ADD COLUMN rear_suspension_type VARCHAR(100),
ADD COLUMN steering_type VARCHAR(100),
ADD COLUMN brake_type_front VARCHAR(50),
ADD COLUMN brake_type_rear VARCHAR(50),
ADD COLUMN handbrake_type VARCHAR(50),
ADD COLUMN front_tire_size VARCHAR(50),
ADD COLUMN rear_tire_size VARCHAR(50),
ADD COLUMN spare_tire_size VARCHAR(50);

`;

        const connection = await mysql.createConnection(process.env.DATABASE_URL);
        console.log('✅ Connected to MySQL');

        await connection.execute(createTableQuery);
        console.log('✅ Table created or already exists');

        await connection.end();
    } catch (error) {
        console.error('❌ Error creating table:', error.message);
        
    }
}

createTable();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Table = require('../models/Table');
const Settings = require('../models/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedTables = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const newTables = [];

        // 1. Section C (C5 - C10)
        for (let i = 5; i <= 10; i++) {
            const tableNum = `C${i}`;
            const exists = await Table.findOne({ tableNumber: tableNum });
            if (!exists) {
                newTables.push({
                    tableNumber: tableNum,
                    name: tableNum,
                    capacity: 4,
                    section: 'Section C',
                    areaType: 'table',
                    shape: 'square'
                });
            }
        }

        // 2. Section D (D1 - D10)
        for (let i = 1; i <= 10; i++) {
            const tableNum = `D${i}`;
            const exists = await Table.findOne({ tableNumber: tableNum });
            if (!exists) {
                newTables.push({
                    tableNumber: tableNum,
                    name: tableNum,
                    capacity: 4,
                    section: 'Section D',
                    areaType: 'table',
                    shape: 'square'
                });
            }
        }

        // 3. Ground Floor Rooms (101 - 120)
        for (let i = 101; i <= 120; i++) {
            const roomNum = `${i}`;
            const exists = await Table.findOne({ tableNumber: roomNum });
            if (!exists) {
                newTables.push({
                    tableNumber: roomNum,
                    name: `Room ${roomNum}`,
                    capacity: 2,
                    section: 'Ground Floor',
                    areaType: 'room',
                    shape: 'rectangle'
                });
            }
        }

        // 4. 1st Floor Rooms (201 - 220)
        for (let i = 201; i <= 220; i++) {
            const roomNum = `${i}`;
            const exists = await Table.findOne({ tableNumber: roomNum });
            if (!exists) {
                newTables.push({
                    tableNumber: roomNum,
                    name: `Room ${roomNum}`,
                    capacity: 2,
                    section: '1st Floor',
                    areaType: 'room',
                    shape: 'rectangle'
                });
            }
        }

        // 5. 2nd Floor Rooms (301 - 304)
        for (let i = 301; i <= 304; i++) {
            const roomNum = `${i}`;
            const exists = await Table.findOne({ tableNumber: roomNum });
            if (!exists) {
                newTables.push({
                    tableNumber: roomNum,
                    name: `Room ${roomNum}`,
                    capacity: 2,
                    section: '2nd Floor',
                    areaType: 'room',
                    shape: 'rectangle'
                });
            }
        }

        if (newTables.length > 0) {
            const created = await Table.insertMany(newTables);
            console.log(`Successfully created ${created.length} tables/rooms!`);
        } else {
            console.log('No new tables to insert, all already exist.');
        }

        // Ensure custom_sections in Settings contains all newly seeded sections
        const custom = (await Settings.getSetting('custom_sections', [])) || [];
        const sectionsToAdd = ['Section A', 'Section B', 'Section C', 'Section D', 'Ground Floor', '1st Floor', '2nd Floor'];
        let updated = false;
        sectionsToAdd.forEach(s => {
            if (!custom.includes(s)) {
                custom.push(s);
                updated = true;
            }
        });
        if (updated) {
            await Settings.setSetting('custom_sections', custom, 'Custom table sections');
            console.log('Updated custom sections settings list.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seedTables();

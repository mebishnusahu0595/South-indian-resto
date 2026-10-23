const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Table = require('../models/Table');
const Settings = require('../models/Settings');

// The exact 32 hotel rooms from Hotel PMS
const EXACT_HOTEL_ROOMS = [
    // 1st Floor (16 rooms)
    { tableNumber: '201', name: 'Room 201', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '202', name: 'Room 202', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '203', name: 'Room 203', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '204', name: 'Room 204', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '205', name: 'Room 205', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '206', name: 'Room 206', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '207', name: 'Room 207', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '208', name: 'Room 208', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '209', name: 'Room 209', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '210', name: 'Room 210', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '211', name: 'Room 211', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '212', name: 'Room 212', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '301', name: 'Room 301', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '302', name: 'Room 302', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '303', name: 'Room 303', section: '1st Floor', floor: '1st Floor' },
    { tableNumber: '304', name: 'Room 304', section: '1st Floor', floor: '1st Floor' },

    // 2nd Floor (4 rooms)
    { tableNumber: '101-2nd', name: 'Room 101-2nd', section: '2nd Floor', floor: '2nd Floor' },
    { tableNumber: '102-2nd', name: 'Room 102-2nd', section: '2nd Floor', floor: '2nd Floor' },
    { tableNumber: '103-2nd', name: 'Room 103-2nd', section: '2nd Floor', floor: '2nd Floor' },
    { tableNumber: '104-2nd', name: 'Room 104-2nd', section: '2nd Floor', floor: '2nd Floor' },

    // Ground Floor (12 rooms)
    { tableNumber: '101', name: 'Room 101', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '102', name: 'Room 102', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '103', name: 'Room 103', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '104', name: 'Room 104', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '105', name: 'Room 105', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '106', name: 'Room 106', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '107', name: 'Room 107', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '108', name: 'Room 108', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '109', name: 'Room 109', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '110', name: 'Room 110', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '111', name: 'Room 111', section: 'Ground Floor', floor: 'Ground Floor' },
    { tableNumber: '112', name: 'Room 112', section: 'Ground Floor', floor: 'Ground Floor' }
];

async function syncRooms() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keabythepool';
        await mongoose.connect(mongoUri);
        console.log(`Connected to MongoDB: ${mongoUri}`);

        const targetNumbersSet = new Set(EXACT_HOTEL_ROOMS.map(r => r.tableNumber));

        // 1. Find existing room tables
        const existingRooms = await Table.find({
            $or: [
                { areaType: 'room' },
                { section: { $in: ['Ground Floor', '1st Floor', '2nd Floor'] } },
                { name: /^Room\s+/i }
            ]
        });

        console.log(`Currently found ${existingRooms.length} room tables in database.`);

        // 2. Identify and delete obsolete rooms (rooms NOT in the 32 list)
        const obsoleteRooms = existingRooms.filter(t => !targetNumbersSet.has(t.tableNumber));
        if (obsoleteRooms.length > 0) {
            const obsoleteIds = obsoleteRooms.map(t => t._id);
            const obsoleteNumbers = obsoleteRooms.map(t => t.tableNumber);
            console.log(`Deleting ${obsoleteRooms.length} obsolete rooms not in PMS list:`, obsoleteNumbers.join(', '));
            await Table.deleteMany({ _id: { $in: obsoleteIds } });
            console.log(`Deleted ${obsoleteRooms.length} obsolete room tables.`);
        } else {
            console.log('No obsolete rooms found to delete.');
        }

        // 3. Upsert the exact 32 rooms
        let addedCount = 0;
        let updatedCount = 0;

        for (const room of EXACT_HOTEL_ROOMS) {
            const existing = await Table.findOne({ tableNumber: room.tableNumber });
            if (existing) {
                existing.name = room.name;
                existing.section = room.section;
                existing.areaType = 'room';
                existing.capacity = 2;
                existing.shape = 'rectangle';
                await existing.save();
                updatedCount++;
            } else {
                await Table.create({
                    tableNumber: room.tableNumber,
                    name: room.name,
                    section: room.section,
                    areaType: 'room',
                    capacity: 2,
                    shape: 'rectangle',
                    status: 'available',
                    isOccupied: false,
                    isActive: true
                });
                addedCount++;
            }
        }

        console.log(`Upsert complete: ${addedCount} rooms created, ${updatedCount} rooms updated/verified.`);

        // 4. Update custom_sections settings
        const custom = (await Settings.getSetting('custom_sections', [])) || [];
        const floorSections = ['Ground Floor', '1st Floor', '2nd Floor'];
        let sectionsUpdated = false;
        floorSections.forEach(s => {
            if (!custom.includes(s)) {
                custom.push(s);
                sectionsUpdated = true;
            }
        });
        if (sectionsUpdated) {
            await Settings.setSetting('custom_sections', custom, 'Custom table sections');
            console.log('Updated custom sections in settings.');
        }

        // 5. Final verification count
        const finalRooms = await Table.find({
            $or: [
                { areaType: 'room' },
                { section: { $in: ['Ground Floor', '1st Floor', '2nd Floor'] } }
            ]
        }).sort({ tableNumber: 1 });

        console.log(`\n========================================`);
        console.log(`VERIFICATION: Exact Room Count = ${finalRooms.length}`);
        console.log(`Breakdown by Floor:`);
        const floors = ['Ground Floor', '1st Floor', '2nd Floor'];
        floors.forEach(f => {
            const onFloor = finalRooms.filter(r => r.section === f);
            console.log(`  - ${f} (${onFloor.length} rooms): ${onFloor.map(r => r.tableNumber).join(', ')}`);
        });
        console.log(`========================================\n`);

        process.exit(0);
    } catch (err) {
        console.error('Error syncing rooms:', err);
        process.exit(1);
    }
}

syncRooms();

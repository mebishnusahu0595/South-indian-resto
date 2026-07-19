require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Category = require('./models/Category');
const MenuItem = require('./models/MenuItem');
const Coupon = require('./models/Coupon');
const Inventory = require('./models/Inventory');
const Employee = require('./models/Employee');
const Table = require('./models/Table');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB Atlas');

        // Clear existing data
        await Promise.all([
            User.deleteMany({}),
            Category.deleteMany({}),
            MenuItem.deleteMany({}),
            Coupon.deleteMany({}),
            Inventory.deleteMany({}),
            Employee.deleteMany({}),
            Table.deleteMany({})
        ]);
        console.log('Cleared existing data');

        // Create Superadmin User
        const superadmin = await User.create({
            phone: '9999999999',
            name: 'Superadmin',
            email: 'superadmin@keabythepool.com',
            role: 'superadmin',
            password: 'admin123',
            isVerified: true
        });
        console.log('Superadmin user created');

        // Create Standard Admin User
        const admin = await User.create({
            phone: '8888888888',
            name: 'Manager Admin',
            email: 'admin@keabythepool.com',
            role: 'admin',
            password: 'admin123',
            isVerified: true
        });
        console.log('Admin user created');

        // Create Categories
        const categories = await Category.insertMany([
            { name: 'Coolers & Mocktails', description: 'Refreshing pool-side drinks', order: 1, image: '/uploads/category_coolers.jpg' },
            { name: 'Finger Food', description: 'Quick bites and appetizers', order: 2, image: '/uploads/category_finger_food.jpg' },
            { name: 'Pizzas & Pastas', description: 'Fresh oven pizzas and creamy pastas', order: 3, image: '/uploads/category_pizza_pasta.jpg' },
            { name: 'Burgers & Wraps', description: 'Hearty burgers and grilled wraps', order: 4, image: '/uploads/category_burgers_wraps.jpg' },
            { name: 'Desserts', description: 'Decadent sweet treats', order: 5, image: '/uploads/category_desserts.jpg' }
        ]);
        console.log('Categories created:', categories.length);

        // Get category IDs
        const mocktailsId = categories.find(c => c.name === 'Coolers & Mocktails')._id;
        const fingerFoodId = categories.find(c => c.name === 'Finger Food')._id;
        const pizzaPastaId = categories.find(c => c.name === 'Pizzas & Pastas')._id;
        const burgersWrapsId = categories.find(c => c.name === 'Burgers & Wraps')._id;
        const dessertsId = categories.find(c => c.name === 'Desserts')._id;

        // Create Menu Items
        const menuItems = await MenuItem.insertMany([
            // Mocktails & Coolers
            { name: 'Virgin Mojito', description: 'Refreshing lime and mint with soda', price: 90, category: mocktailsId, isVeg: true, isBestSeller: true, image: '/uploads/virgin_mojito.jpg' },
            { name: 'Blue Lagoon', description: 'Curacao syrup with lemonade and soda', price: 95, category: mocktailsId, isVeg: true, isBestSeller: true, image: '/uploads/blue_lagoon.jpg' },
            { name: 'Watermelon Mint Cooler', description: 'Fresh watermelon juice muddled with mint', price: 110, category: mocktailsId, isVeg: true, isNewItem: true, image: '/uploads/watermelon_cooler.jpg' },
            { name: 'Peach Iced Tea', description: 'Brewed black tea with peach flavor', price: 80, category: mocktailsId, isVeg: true, image: '/uploads/peach_iced_tea.jpg' },
            { name: 'Cold Coffee', description: 'Rich blended coffee with vanilla ice cream', price: 100, category: mocktailsId, isVeg: true, isNewItem: true, image: '/uploads/cold_coffee.jpg' },
            { name: 'Water Bottle', description: '500ml packaged drinking water', price: 20, category: mocktailsId, isVeg: true, isRecommended: true, image: '/uploads/water_bottle.jpg' },
            { name: 'Soft Drink', description: 'Cola / Sprite / Fanta', price: 40, category: mocktailsId, isVeg: true, isRecommended: true, image: '/uploads/soft_drink.jpg' },

            // Finger Food
            { name: 'French Fries', description: 'Salted golden potato fries', price: 80, category: fingerFoodId, isVeg: true, isRecommended: true, image: '/uploads/french_fries.jpg' },
            { name: 'Multani Paneer Tikka', description: 'Spiced paneer stuffed with herbs, grilled in tandoor', price: 180, category: fingerFoodId, isVeg: true, isBestSeller: true, image: '/uploads/paneer_tikka.jpg' },
            { name: 'Garlic Bread with Cheese', description: 'Toasted baguette with garlic butter and melted cheese', price: 110, category: fingerFoodId, isVeg: true, image: '/uploads/garlic_bread.jpg' },
            { name: 'Loaded Nachos', description: 'Tortilla chips topped with cheese sauce, salsa and jalapeños', price: 130, category: fingerFoodId, isVeg: true, isNewItem: true, image: '/uploads/loaded_nachos.jpg' },
            { name: 'Chilli Chicken', description: 'Spicy stir-fried chicken with bell peppers and onions', price: 190, category: fingerFoodId, isVeg: false, isBestSeller: true, image: '/uploads/chilli_chicken.jpg' },

            // Pizzas & Pastas
            { name: 'Margherita Pizza', description: 'Classic pizza with tomato sauce, mozzarella and fresh basil', price: 199, category: pizzaPastaId, isVeg: true, isBestSeller: true, image: '/uploads/margherita_pizza.jpg' },
            { name: 'Poolside Special Pizza', description: 'Topped with mushrooms, olives, onions, paneer and bell peppers', price: 249, category: pizzaPastaId, isVeg: true, isNewItem: true, image: '/uploads/poolside_pizza.jpg' },
            { name: 'Alfredo Pasta (Veg)', description: 'Penne pasta tossed in rich and creamy white sauce', price: 169, category: pizzaPastaId, isVeg: true, image: '/uploads/alfredo_pasta.jpg' },
            { name: 'Arrabbiata Pasta (Non-Veg)', description: 'Spicy tomato sauce pasta with grilled chicken chunks', price: 199, category: pizzaPastaId, isVeg: false, isBestSeller: true, image: '/uploads/arrabbiata_pasta.jpg' },

            // Burgers & Wraps
            { name: 'Veggie Crunch Burger', description: 'Crispy vegetable patty with lettuce, tomato and mayo', price: 99, category: burgersWrapsId, isVeg: true, image: '/uploads/veggie_burger.jpg' },
            { name: 'Double Cheese Burger', description: 'Double potato patty with extra cheddar slice', price: 139, category: burgersWrapsId, isVeg: true, isBestSeller: true, image: '/uploads/double_cheese_burger.jpg' },
            { name: 'Grilled Chicken Wrap', description: 'Tortilla wrap stuffed with grilled chicken and salad', price: 149, category: burgersWrapsId, isVeg: false, isNewItem: true, image: '/uploads/chicken_wrap.jpg' },

            // Desserts
            { name: 'Brownie with Ice Cream', description: 'Warm fudge brownie topped with vanilla ice cream', price: 120, category: dessertsId, isVeg: true, isBestSeller: true, image: '/uploads/brownie.jpg' },
            { name: 'Fresh Fruit Platter', description: 'Slices of seasonal fresh fruits by the pool', price: 110, category: dessertsId, isVeg: true, isRecommended: true, image: '/uploads/fruit_platter.jpg' },
            { name: 'Blueberry Cheesecake', description: 'Creamy cold cheesecake topped with blueberry compote', price: 150, category: dessertsId, isVeg: true, isNewItem: true, image: '/uploads/cheesecake.jpg' }
        ]);
        console.log('Menu items created:', menuItems.length);

        // Create Coupons
        const coupons = await Coupon.insertMany([
            {
                code: 'WELCOME10',
                description: 'Get 10% off on your first order',
                discountType: 'percentage',
                discountValue: 10,
                minOrderAmount: 100,
                maxDiscount: 50,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                isActive: true
            },
            {
                code: 'POOL20',
                description: 'Flat ₹20 off on your poolside snacks',
                discountType: 'fixed',
                discountValue: 20,
                minOrderAmount: 150,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                isActive: true
            },
            {
                code: 'MOCKTAIL50',
                description: 'Get ₹50 off on orders above ₹300',
                discountType: 'fixed',
                discountValue: 50,
                minOrderAmount: 300,
                validFrom: new Date(),
                validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                isActive: true
            }
        ]);
        console.log('Coupons created:', coupons.length);

        // Create Inventory Items
        const inventory = await Inventory.insertMany([
            { name: 'Paneer', category: 'ingredient', unit: 'kg', currentStock: 15, minimumStock: 5, costPerUnit: 350, supplier: 'Dairy Supplier' },
            { name: 'Chicken Breast', category: 'ingredient', unit: 'kg', currentStock: 20, minimumStock: 8, costPerUnit: 240, supplier: 'Poultry Supplier' },
            { name: 'Cheese (Mozzarella)', category: 'ingredient', unit: 'kg', currentStock: 25, minimumStock: 10, costPerUnit: 420, supplier: 'Dairy Supplier' },
            { name: 'Pizza Base', category: 'ingredient', unit: 'pieces', currentStock: 50, minimumStock: 20, costPerUnit: 15, supplier: 'Bakery Supplier' },
            { name: 'Penne Pasta', category: 'ingredient', unit: 'kg', currentStock: 15, minimumStock: 5, costPerUnit: 110, supplier: 'Local Supplier' },
            { name: 'Potatoes (Fries)', category: 'ingredient', unit: 'kg', currentStock: 40, minimumStock: 15, costPerUnit: 40, supplier: 'Vegetable Market' },
            { name: 'Fresh Mint Leaves', category: 'ingredient', unit: 'kg', currentStock: 5, minimumStock: 2, costPerUnit: 80, supplier: 'Vegetable Market' },
            { name: 'Lemons', category: 'ingredient', unit: 'pieces', currentStock: 100, minimumStock: 30, costPerUnit: 3, supplier: 'Vegetable Market' },
            { name: 'Mocktail Syrups', category: 'ingredient', unit: 'bottles', currentStock: 12, minimumStock: 4, costPerUnit: 250, supplier: 'Beverage Supplier' },
            { name: 'Sugar', category: 'ingredient', unit: 'kg', currentStock: 20, minimumStock: 10, costPerUnit: 45, supplier: 'Local Supplier' },
            { name: 'Water Bottles', category: 'other', unit: 'pieces', currentStock: 100, minimumStock: 50, costPerUnit: 10, supplier: 'Beverage Supplier' },
            { name: 'Paper Napkins', category: 'packaging', unit: 'pack', currentStock: 40, minimumStock: 15, costPerUnit: 30, supplier: 'Packaging Supplier' },
            { name: 'Takeaway Boxes', category: 'packaging', unit: 'pack', currentStock: 80, minimumStock: 30, costPerUnit: 160, supplier: 'Packaging Supplier' }
        ]);
        console.log('Inventory items created:', inventory.length);

        // Create Employees
        const employees = await Employee.insertMany([
            { name: 'Raju Kumar', phone: '9876543210', role: 'chef', salary: 25000, email: 'raju@keabythepool.com' },
            { name: 'Suresh Nair', phone: '9876543211', role: 'chef', salary: 22000, email: 'suresh@keabythepool.com' },
            { name: 'Priya Sharma', phone: '9876543212', role: 'waiter', salary: 15000, email: 'priya@keabythepool.com' },
            { name: 'Ankit Verma', phone: '9876543213', role: 'waiter', salary: 15000, email: 'ankit@keabythepool.com' },
            { name: 'Meena Devi', phone: '9876543214', role: 'cashier', salary: 18000, email: 'meena@keabythepool.com' },
            { name: 'Ramesh Iyer', phone: '9876543215', role: 'manager', salary: 35000, email: 'ramesh@keabythepool.com' },
            { name: 'Sunita Kumari', phone: '9876543216', role: 'cleaner', salary: 12000 }
        ]);
        console.log('Employees created:', employees.length);

        // Create Tables
        const tables = [];
        for (let i = 1; i <= 12; i++) {
            tables.push({ tableNumber: i.toString(), capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6 });
        }
        const createdTables = await Table.insertMany(tables);
        console.log('Tables created:', createdTables.length);

        console.log('\n✅ Kea By The Pool database seeded successfully!');
        console.log('\n📊 Summary:');
        console.log('- Admin: phone: 9999999999, password: admin123');
        console.log('- Categories:', categories.length);
        console.log('- Menu Items:', menuItems.length);
        console.log('- Coupons:', coupons.length);
        console.log('- Inventory Items:', inventory.length);
        console.log('- Employees:', employees.length);
        console.log('- Tables:', createdTables.length);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

seedData();

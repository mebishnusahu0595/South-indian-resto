require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');

const categoriesData = [
  {
    name: 'Beverages',
    description: 'Refreshing hot and cold beverages',
    order: 1,
    items: [
      { name: 'Coffee', price: 120, isVeg: true },
      { name: 'Tea', price: 60, isVeg: true },
      { name: 'Ice Tea', price: 140, isVeg: true },
      { name: 'Cold Coffee', price: 160, isVeg: true },
      { name: 'Caramel Cold Coffee', price: 180, isVeg: true },
      { name: 'Chocolate Milkshake', price: 190, isVeg: true },
      { name: 'Orange Milkshake', price: 190, isVeg: true },
      { name: 'Vanilla Milkshake', price: 180, isVeg: true },
      { name: 'Sweet Lassi', price: 110, isVeg: true },
      { name: 'Salt Lassi', price: 110, isVeg: true },
      { name: 'Butter Milk', price: 80, isVeg: true },
      { name: 'Masala Cold Drink', price: 90, isVeg: true },
      { name: 'Packaged Drinking Water', price: 30, isVeg: true }
    ]
  },
  {
    name: 'Veg Soup',
    description: 'Hot and comforting vegetarian soups',
    order: 2,
    items: [
      { name: 'Chinese Manchow Veg Soup', price: 160, isVeg: true },
      { name: 'Chinese Sweet Corn Veg Soup', price: 160, isVeg: true },
      { name: 'Chinese Hot & Sour Veg Soup', price: 160, isVeg: true },
      { name: 'Cream of Tomato Soup', price: 170, isVeg: true },
      { name: 'Cream of Veg Soup', price: 170, isVeg: true },
      { name: 'Cream of Mushroom Soup', price: 185, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Soup',
    description: 'Flavorful non-vegetarian soups',
    order: 3,
    items: [
      { name: 'Chicken Manchow Soup', price: 190, isVeg: false },
      { name: 'Chicken Lemon Coriander Soup', price: 190, isVeg: false },
      { name: 'Chicken Hot & Sour Soup', price: 190, isVeg: false },
      { name: 'Lung Fung Thick Soup', price: 220, isVeg: false },
      { name: 'Lung Fung Spicy Soup', price: 220, isVeg: false }
    ]
  },
  {
    name: 'Mocktails',
    description: 'Exotic poolside mocktails & coolers',
    order: 4,
    items: [
      { name: 'Red Bull Cooler', price: 240, isVeg: true },
      { name: 'Orange Paradise', price: 180, isVeg: true },
      { name: 'Virgin Margarita', price: 190, isVeg: true },
      { name: 'Blue Hawaii', price: 190, isVeg: true },
      { name: 'Spicy Guava', price: 180, isVeg: true },
      { name: 'Kala Khatta', price: 170, isVeg: true },
      { name: 'Chia Spicy Mocktail', price: 190, isVeg: true },
      { name: 'Mojito', price: 180, isVeg: true }
    ]
  },
  {
    name: 'Veg Salad',
    description: 'Fresh and healthy vegetarian salads',
    order: 5,
    items: [
      { name: 'Green Garden Salad', price: 120, isVeg: true },
      { name: 'Kachumber Salad', price: 110, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Salad',
    description: 'Protein-packed non-veg salads',
    order: 6,
    items: [
      { name: 'Maxicon Chicken Salad', price: 240, isVeg: false },
      { name: 'Chicken Smoked Grilled Salad', price: 260, isVeg: false }
    ]
  },
  {
    name: 'Accompaniments / Starters',
    description: 'Crispy snacks, papads, and raitas',
    order: 7,
    items: [
      { name: 'Nachos', price: 180, isVeg: true },
      { name: 'Salted French Fries', price: 150, isVeg: true },
      { name: 'Peri Peri French Fries', price: 170, isVeg: true },
      { name: 'Cheesy French Fries', price: 190, isVeg: true },
      { name: 'Masala Papad', price: 70, isVeg: true },
      { name: 'Roasted Papad', price: 40, isVeg: true },
      { name: 'Fried Papad', price: 50, isVeg: true },
      { name: 'Boondi Raita', price: 120, isVeg: true },
      { name: 'Veg Raita', price: 130, isVeg: true },
      { name: 'Mint Raita', price: 130, isVeg: true },
      { name: 'Pineapple Raita', price: 150, isVeg: true }
    ]
  },
  {
    name: 'Veg Appetizer',
    description: 'Tandoori & Chinese vegetarian starters',
    order: 8,
    items: [
      { name: 'Veg Cheese Kebab', price: 280, isVeg: true },
      { name: 'Paneer Sultana Tikka', price: 320, isVeg: true },
      { name: 'Multani Paneer Tikka', price: 320, isVeg: true },
      { name: 'Tandoori Paneer Chilly', price: 310, isVeg: true },
      { name: 'Maxicon Cheese Roll', price: 290, isVeg: true },
      { name: 'Chilly Coriander Water Chestnuts', price: 330, isVeg: true },
      { name: 'Chilly Paneer', price: 290, isVeg: true },
      { name: 'Chilly Baby Corn', price: 280, isVeg: true },
      { name: 'Chilly Chana', price: 260, isVeg: true },
      { name: 'Corn Salt n Pepper', price: 260, isVeg: true },
      { name: 'Crispy Corn', price: 260, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Appetizer',
    description: 'Juicy tandoori & Asian chicken/seafood starters',
    order: 9,
    items: [
      { name: 'Chicken Lazeez Tikka', price: 360, isVeg: false },
      { name: 'Chicken Reshmi Kebab', price: 370, isVeg: false },
      { name: 'Chicken Kurkure', price: 340, isVeg: false },
      { name: 'Chicken Taichi', price: 350, isVeg: false },
      { name: 'Black Bean Chicken', price: 360, isVeg: false },
      { name: 'Chicken Dakshini Tikka', price: 360, isVeg: false },
      { name: 'Chicken Hong Kong', price: 350, isVeg: false },
      { name: 'Lemon Fish Tikka', price: 410, isVeg: false },
      { name: 'Chilly Coriander Fish', price: 410, isVeg: false },
      { name: 'Golden Prawns', price: 450, isVeg: false }
    ]
  },
  {
    name: 'International Veg Main Course',
    description: 'Pizzas, pastas, and Asian veg noodles',
    order: 10,
    items: [
      { name: 'Margherita Pizza', price: 320, isVeg: true },
      { name: 'Pappy Paneer Pizza', price: 360, isVeg: true },
      { name: 'Farm House Pizza', price: 370, isVeg: true },
      { name: 'Red Sauce Pasta', price: 290, isVeg: true },
      { name: 'White Sauce Pasta', price: 310, isVeg: true },
      { name: 'Pink Sauce Pasta', price: 320, isVeg: true },
      { name: 'Ramen Veg Noodles', price: 280, isVeg: true },
      { name: 'Hakka Veg Noodles', price: 260, isVeg: true },
      { name: 'Malaysian Veg Noodles', price: 290, isVeg: true },
      { name: 'Pan Fried Veg Noodles', price: 310, isVeg: true }
    ]
  },
  {
    name: 'International Non-Veg Main Course',
    description: 'Gourmet non-veg pizzas & Asian noodles',
    order: 11,
    items: [
      { name: 'Barbeque Chicken Pizza', price: 410, isVeg: false },
      { name: 'Pappy Paneer Non-Veg Pizza', price: 420, isVeg: false },
      { name: 'Golden Delight Chicken Pizza', price: 440, isVeg: false },
      { name: 'Ramen Chicken Noodles', price: 330, isVeg: false },
      { name: 'Malaysian Chicken Noodles', price: 340, isVeg: false },
      { name: 'Singapore Chicken Noodles', price: 340, isVeg: false },
      { name: 'Pan Fried Chicken Noodles', price: 350, isVeg: false },
      { name: 'Mango Lean Chicken Noodles', price: 360, isVeg: false }
    ]
  },
  {
    name: 'Veg Main Course',
    description: 'Classic North & South Indian veg delicacies',
    order: 12,
    items: [
      { name: 'Rajasthani Kofta', price: 290, isVeg: true },
      { name: 'Veg Kofta', price: 280, isVeg: true },
      { name: 'Malai Kofta', price: 310, isVeg: true },
      { name: 'Paneer Makhanwala', price: 320, isVeg: true },
      { name: 'Paneer Butter Masala', price: 320, isVeg: true },
      { name: 'Paneer Lababdar', price: 330, isVeg: true },
      { name: 'Palak Paneer', price: 310, isVeg: true },
      { name: 'Paneer Bhurji', price: 340, isVeg: true },
      { name: 'Suji Mix Veg Kadhai', price: 270, isVeg: true },
      { name: 'Suji Mix Veg Kolhapuri', price: 280, isVeg: true },
      { name: 'Kashmiri Dum Aloo', price: 280, isVeg: true },
      { name: 'Jeera Aloo', price: 220, isVeg: true },
      { name: 'Gobi Aloo', price: 240, isVeg: true },
      { name: 'Methi Mutter Malai', price: 310, isVeg: true },
      { name: 'Pindi Chole', price: 260, isVeg: true },
      { name: 'Amritsari Chana', price: 260, isVeg: true },
      { name: 'Chana Masala', price: 250, isVeg: true },
      { name: 'Bhindi Do Pyaza', price: 250, isVeg: true },
      { name: 'Bhindi Masala', price: 240, isVeg: true },
      { name: 'Mushroom Masala', price: 310, isVeg: true },
      { name: 'Mushroom Do Pyaza', price: 310, isVeg: true },
      { name: 'Mushroom Mutter', price: 310, isVeg: true },
      { name: 'Dal Tadka', price: 220, isVeg: true },
      { name: 'Dal Dhaba', price: 230, isVeg: true },
      { name: 'Dal Lehsuni Fry', price: 230, isVeg: true },
      { name: 'Kea Special Dal', price: 260, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Main Course',
    description: 'Rich chicken, mutton, fish & egg curries',
    order: 13,
    items: [
      { name: 'Chicken Tikka Masala', price: 380, isVeg: false },
      { name: 'Butter Chicken', price: 390, isVeg: false },
      { name: 'Murgh Bhara', price: 410, isVeg: false },
      { name: 'Murgh Musallam', price: 440, isVeg: false },
      { name: 'Chicken Lababdar', price: 390, isVeg: false },
      { name: 'Kadhai Chicken', price: 380, isVeg: false },
      { name: 'Mutton Rogan Josh', price: 460, isVeg: false },
      { name: 'Mutton Masala', price: 460, isVeg: false },
      { name: 'Mutton Handi', price: 480, isVeg: false },
      { name: 'Fish Tikka Masala', price: 440, isVeg: false },
      { name: 'Fish Curry', price: 430, isVeg: false },
      { name: 'Egg Masala', price: 240, isVeg: false },
      { name: 'Egg Lapeta', price: 250, isVeg: false },
      { name: 'Egg Bhurji', price: 220, isVeg: false }
    ]
  },
  {
    name: 'Rice & Biryani',
    description: 'Aromatic rice, fried rice & veg biryani',
    order: 14,
    items: [
      { name: 'Steam Rice', price: 150, isVeg: true },
      { name: 'Jeera Rice', price: 180, isVeg: true },
      { name: 'Malaysian Veg Fried Rice', price: 240, isVeg: true },
      { name: 'Ghochu Chung Veg Fried Rice', price: 250, isVeg: true },
      { name: 'Burnt Garlic Veg Fried Rice', price: 240, isVeg: true },
      { name: 'Singapore Veg Fried Rice', price: 250, isVeg: true },
      { name: 'Chilly Garlic Veg Fried Rice', price: 240, isVeg: true },
      { name: 'Veg Biryani', price: 290, isVeg: true },
      { name: 'Onion Tomato Jeera Rice', price: 210, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Biryani',
    description: 'Authentic royal biryanis (Chicken, Mutton, Egg, Prawns)',
    order: 15,
    items: [
      { name: 'Egg Biryani', price: 270, isVeg: false },
      { name: 'Chicken Biryani', price: 360, isVeg: false },
      { name: 'Mutton Biryani', price: 440, isVeg: false },
      { name: 'Prawns Biryani', price: 470, isVeg: false }
    ]
  },
  {
    name: 'Indian Breads',
    description: 'Tandoori rotis, naans, kulchas & parathas',
    order: 16,
    items: [
      { name: 'Plain Tandoori Roti', price: 30, isVeg: true },
      { name: 'Butter Tandoori Roti', price: 40, isVeg: true },
      { name: 'Plain Naan', price: 60, isVeg: true },
      { name: 'Butter Naan', price: 70, isVeg: true },
      { name: 'Garlic Naan', price: 90, isVeg: true },
      { name: 'Aloo Kulcha', price: 90, isVeg: true },
      { name: 'Veg Kulcha', price: 100, isVeg: true },
      { name: 'Paneer Kulcha', price: 120, isVeg: true },
      { name: 'Lachha Paratha', price: 80, isVeg: true }
    ]
  },
  {
    name: 'Desserts',
    description: 'Sweet treats & ice creams',
    order: 17,
    items: [
      { name: 'Coconut Roll with Mawa Sauce', price: 220, isVeg: true },
      { name: 'Banana Candy with Ice Cream', price: 210, isVeg: true },
      { name: 'Fried Ice Cream', price: 240, isVeg: true },
      { name: 'Gulab Jamun (2 pcs)', price: 140, isVeg: true }
    ]
  }
];

async function seedFullMenu() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keabythepool';
    console.log('Connecting to MongoDB at:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    // Clear existing categories and menu items
    await Category.deleteMany({});
    await MenuItem.deleteMany({});
    console.log('Cleared existing Categories & Menu Items.');

    let totalCategories = 0;
    let totalItems = 0;

    for (const catData of categoriesData) {
      const categoryDoc = await Category.create({
        name: catData.name,
        description: catData.description,
        order: catData.order,
        image: '' // No images as requested
      });
      totalCategories++;

      const menuDocs = catData.items.map(item => ({
        name: item.name,
        description: '',
        price: item.price,
        image: '', // No images as requested
        category: categoryDoc._id,
        isVeg: item.isVeg,
        isAvailable: true,
        preparationTime: 15,
        stockQuantity: -1
      }));

      const createdItems = await MenuItem.insertMany(menuDocs);
      totalItems += createdItems.length;
      console.log(`✓ Category "${catData.name}" created with ${createdItems.length} items.`);
    }

    console.log(`\n🎉 Seed Complete! Added ${totalCategories} Categories and ${totalItems} Menu Items (no images).`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding menu:', err);
    process.exit(1);
  }
}

seedFullMenu();

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
      { name: 'Coffee', price: 40, isVeg: true },
      { name: 'Tea', price: 35, isVeg: true },
      { name: 'Ice Tea', price: 60, isVeg: true },
      { name: 'Cold Coffee', price: 149, isVeg: true },
      { name: 'Caramel Cold Coffee', price: 149, isVeg: true },
      { name: 'Chocolate Milkshake', price: 119, isVeg: true },
      { name: 'Orange Milkshake', price: 119, isVeg: true },
      { name: 'Vanilla Milkshake', price: 119, isVeg: true },
      { name: 'Sweet Lassi', price: 99, isVeg: true },
      { name: 'Salt Lassi', price: 99, isVeg: true },
      { name: 'Butter Milk', price: 99, isVeg: true },
      { name: 'Masala Cold Drink', price: 99, isVeg: true },
      { name: 'Packaged Drinking Water', price: 10, isVeg: true }
    ]
  },
  {
    name: 'Veg Soup',
    description: 'Hot and comforting vegetarian soups',
    order: 2,
    items: [
      { name: 'Chinese Manchow Veg Soup', price: 165, isVeg: true },
      { name: 'Chinese Sweet Corn Veg Soup', price: 165, isVeg: true },
      { name: 'Chinese Hot & Sour Veg Soup', price: 165, isVeg: true },
      { name: 'Cream of Tomato Soup', price: 165, isVeg: true },
      { name: 'Cream of Veg Soup', price: 165, isVeg: true },
      { name: 'Cream of Mushroom Soup', price: 165, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Soup',
    description: 'Flavorful non-vegetarian soups',
    order: 3,
    items: [
      { name: 'Chicken Manchow Soup', price: 165, isVeg: false },
      { name: 'Chicken Lemon Coriander Soup', price: 165, isVeg: false },
      { name: 'Chicken Hot & Sour Soup', price: 165, isVeg: false },
      { name: 'Lung Fung Thick Soup', price: 165, isVeg: false },
      { name: 'Lung Fung Spicy Soup', price: 165, isVeg: false }
    ]
  },
  {
    name: 'Mocktails',
    description: 'Exotic poolside mocktails & coolers',
    order: 4,
    items: [
      { name: 'Red Bull Cooler', price: 249, isVeg: true },
      { name: 'Orange Paradise', price: 221, isVeg: true },
      { name: 'Virgin Margarita', price: 225, isVeg: true },
      { name: 'Blue Hawaii', price: 225, isVeg: true },
      { name: 'Spicy Guava', price: 225, isVeg: true },
      { name: 'Kala Khatta', price: 225, isVeg: true },
      { name: 'Chia Spicy Mocktail', price: 225, isVeg: true },
      { name: 'Mojito', price: 225, isVeg: true }
    ]
  },
  {
    name: 'Veg Salad',
    description: 'Fresh and healthy vegetarian salads',
    order: 5,
    items: [
      { name: 'Green Garden Salad', price: 110, isVeg: true },
      { name: 'Kachumber Salad', price: 110, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Salad',
    description: 'Protein-packed non-veg salads',
    order: 6,
    items: [
      { name: 'Maxicon Chicken Salad', price: 285, isVeg: false },
      { name: 'Chicken Smoked Grilled Salad', price: 285, isVeg: false }
    ]
  },
  {
    name: 'Accompaniments / Starters',
    description: 'Crispy snacks, papads, and raitas',
    order: 7,
    items: [
      { name: 'Nachos', price: 165, isVeg: true },
      { name: 'Salted French Fries', price: 165, isVeg: true },
      { name: 'Peri Peri French Fries', price: 165, isVeg: true },
      { name: 'Cheesy French Fries', price: 165, isVeg: true },
      { name: 'Masala Papad', price: 50, isVeg: true },
      { name: 'Roasted Papad', price: 25, isVeg: true },
      { name: 'Fried Papad', price: 35, isVeg: true },
      { name: 'Boondi Raita', price: 110, isVeg: true },
      { name: 'Veg Raita', price: 110, isVeg: true },
      { name: 'Mint Raita', price: 110, isVeg: true },
      { name: 'Pineapple Raita', price: 110, isVeg: true }
    ]
  },
  {
    name: 'Veg Appetizer',
    description: 'Tandoori & Chinese vegetarian starters',
    order: 8,
    items: [
      { name: 'Veg Cheese Kebab', price: 315, isVeg: true },
      { name: 'Paneer Sultana Tikka', price: 315, isVeg: true },
      { name: 'Multani Paneer Tikka', price: 315, isVeg: true },
      { name: 'Tandoori Paneer Chilly', price: 315, isVeg: true },
      { name: 'Maxicon Cheese Roll', price: 315, isVeg: true },
      { name: 'Chilly Coriander Water Chestnuts', price: 315, isVeg: true },
      { name: 'Chilly Paneer', price: 315, isVeg: true },
      { name: 'Chilly Baby Corn', price: 315, isVeg: true },
      { name: 'Chilly Chana', price: 315, isVeg: true },
      { name: 'Corn Salt n Pepper', price: 315, isVeg: true },
      { name: 'Crispy Corn', price: 315, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Appetizer',
    description: 'Juicy tandoori & Asian chicken/seafood starters',
    order: 9,
    items: [
      { name: 'Chicken Lazeez Tikka', price: 325, isVeg: false },
      { name: 'Chicken Reshmi Kebab', price: 325, isVeg: false },
      { name: 'Chicken Kurkure', price: 325, isVeg: false },
      { name: 'Chicken Taichi', price: 325, isVeg: false },
      { name: 'Black Bean Chicken', price: 325, isVeg: false },
      { name: 'Chicken Dakshini Tikka', price: 325, isVeg: false },
      { name: 'Chicken Hong Kong', price: 325, isVeg: false },
      { name: 'Lemon Fish Tikka', price: 325, isVeg: false },
      { name: 'Chilly Coriander Fish', price: 325, isVeg: false },
      { name: 'Golden Prawns', price: 349, isVeg: false }
    ]
  },
  {
    name: 'International Veg',
    description: 'Pizzas, pastas, and Asian veg noodles',
    order: 10,
    items: [
      { name: 'Margherita Pizza', price: 375, isVeg: true },
      { name: 'Pappy Paneer Pizza', price: 375, isVeg: true },
      { name: 'Farm House Pizza', price: 375, isVeg: true },
      { name: 'Red Sauce Pasta', price: 325, isVeg: true },
      { name: 'White Sauce Pasta', price: 325, isVeg: true },
      { name: 'Pink Sauce Pasta', price: 325, isVeg: true },
      { name: 'Ramen Veg Noodles', price: 299, isVeg: true },
      { name: 'Hakka Veg Noodles', price: 299, isVeg: true },
      { name: 'Malaysian Veg Noodles', price: 299, isVeg: true },
      { name: 'Pan Fried Veg Noodles', price: 299, isVeg: true }
    ]
  },
  {
    name: 'International Non-Veg',
    description: 'Gourmet non-veg pizzas & Asian noodles',
    order: 11,
    items: [
      { name: 'Barbeque Chicken Pizza', price: 435, isVeg: false },
      { name: 'Pappy Paneer Non-Veg Pizza', price: 435, isVeg: false },
      { name: 'Golden Delight Chicken Pizza', price: 435, isVeg: false },
      { name: 'Ramen Chicken Noodles', price: 349, isVeg: false },
      { name: 'Malaysian Chicken Noodles', price: 349, isVeg: false },
      { name: 'Singapore Chicken Noodles', price: 349, isVeg: false },
      { name: 'Pan Fried Chicken Noodles', price: 349, isVeg: false },
      { name: 'Mango Lean Chicken Noodles', price: 349, isVeg: false }
    ]
  },
  {
    name: 'Veg Main Course',
    description: 'Classic North & South Indian veg delicacies',
    order: 12,
    items: [
      { name: 'Rajasthani Kofta', price: 325, isVeg: true },
      { name: 'Veg Kofta', price: 325, isVeg: true },
      { name: 'Malai Kofta', price: 325, isVeg: true },
      { name: 'Paneer Makhanwala', price: 325, isVeg: true },
      { name: 'Paneer Butter Masala', price: 325, isVeg: true },
      { name: 'Paneer Lababdar', price: 325, isVeg: true },
      { name: 'Palak Paneer', price: 325, isVeg: true },
      { name: 'Paneer Bhurji', price: 325, isVeg: true },
      { name: 'Suji Mix Veg Kadhai', price: 225, isVeg: true },
      { name: 'Suji Mix Veg Kolhapuri', price: 225, isVeg: true },
      { name: 'Kashmiri Dum Aloo', price: 225, isVeg: true },
      { name: 'Jeera Aloo', price: 225, isVeg: true },
      { name: 'Gobi Aloo', price: 225, isVeg: true },
      { name: 'Methi Mutter Malai', price: 325, isVeg: true },
      { name: 'Pindi Chole', price: 325, isVeg: true },
      { name: 'Amritsari Chana', price: 325, isVeg: true },
      { name: 'Chana Masala', price: 325, isVeg: true },
      { name: 'Bhindi Do Pyaza', price: 325, isVeg: true },
      { name: 'Bhindi Masala', price: 325, isVeg: true },
      { name: 'Mushroom Masala', price: 249, isVeg: true },
      { name: 'Mushroom Do Pyaza', price: 249, isVeg: true },
      { name: 'Mushroom Mutter', price: 249, isVeg: true },
      { name: 'Dal Tadka', price: 149, isVeg: true },
      { name: 'Dal Dhaba', price: 149, isVeg: true },
      { name: 'Dal Lehsuni Fry', price: 149, isVeg: true },
      { name: 'Kea Special Dal', price: 149, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Main Course',
    description: 'Rich chicken, mutton, fish & egg curries',
    order: 13,
    items: [
      { name: 'Chicken Tikka Masala', price: 349, isVeg: false },
      { name: 'Butter Chicken', price: 349, isVeg: false },
      { name: 'Murgh Bhara', price: 349, isVeg: false },
      { name: 'Murgh Musallam', price: 349, isVeg: false },
      { name: 'Chicken Lababdar', price: 349, isVeg: false },
      { name: 'Kadhai Chicken', price: 399, isVeg: false },
      { name: 'Mutton Rogan Josh', price: 399, isVeg: false },
      { name: 'Mutton Masala', price: 399, isVeg: false },
      { name: 'Mutton Handi', price: 399, isVeg: false },
      { name: 'Fish Tikka Masala', price: 399, isVeg: false },
      { name: 'Fish Curry', price: 399, isVeg: false },
      { name: 'Egg Masala', price: 225, isVeg: false },
      { name: 'Egg Lapeta', price: 225, isVeg: false },
      { name: 'Egg Bhurji', price: 225, isVeg: false }
    ]
  },
  {
    name: 'Rice',
    description: 'Aromatic rice, fried rice & veg biryani',
    order: 14,
    items: [
      { name: 'Steam Rice', price: 159, isVeg: true },
      { name: 'Jeera Rice', price: 179, isVeg: true },
      { name: 'Malaysian Veg Fried Rice', price: 325, isVeg: true },
      { name: 'Ghochu Chung Veg Fried Rice', price: 325, isVeg: true },
      { name: 'Burnt Garlic Veg Fried Rice', price: 325, isVeg: true },
      { name: 'Singapore Veg Fried Rice', price: 325, isVeg: true },
      { name: 'Chilly Garlic Veg Fried Rice', price: 325, isVeg: true },
      { name: 'Veg Biryani', price: 199, isVeg: true },
      { name: 'Onion Tomato Jeera Rice', price: 199, isVeg: true }
    ]
  },
  {
    name: 'Non-Veg Biryani',
    description: 'Authentic royal biryanis (Chicken, Mutton, Egg, Prawns)',
    order: 15,
    items: [
      { name: 'Egg Biryani', price: 299, isVeg: false },
      { name: 'Chicken Biryani', price: 339, isVeg: false },
      { name: 'Mutton Biryani', price: 399, isVeg: false },
      { name: 'Prawns Biryani', price: 399, isVeg: false }
    ]
  },
  {
    name: 'Indian Breads',
    description: 'Tandoori rotis, naans, kulchas & parathas',
    order: 16,
    items: [
      { name: 'Plain Tandoori Roti', price: 30, isVeg: true },
      { name: 'Butter Tandoori Roti', price: 40, isVeg: true },
      { name: 'Plain Naan', price: 30, isVeg: true },
      { name: 'Butter Naan', price: 40, isVeg: true },
      { name: 'Garlic Naan', price: 50, isVeg: true },
      { name: 'Aloo Kulcha', price: 60, isVeg: true },
      { name: 'Veg Kulcha', price: 60, isVeg: true },
      { name: 'Paneer Kulcha', price: 60, isVeg: true },
      { name: 'Lachha Paratha', price: 60, isVeg: true }
    ]
  },
  {
    name: 'Desserts',
    description: 'Sweet treats & ice creams',
    order: 17,
    items: [
      { name: 'Coconut Roll with Mawa Sauce', price: 285, isVeg: true },
      { name: 'Banana Candy with Ice Cream', price: 285, isVeg: true },
      { name: 'Fried Ice Cream', price: 285, isVeg: true },
      { name: 'Gulab Jamun (2 pcs)', price: 149, isVeg: true }
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

    console.log(`\n🎉 Seed Complete! Added ${totalCategories} Categories and ${totalItems} Menu Items (exact prices).`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding menu:', err);
    process.exit(1);
  }
}

seedFullMenu();

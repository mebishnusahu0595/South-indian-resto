import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';

export default function MenuScreen({ api, cart, selectedTable, onUpdateCart, onBack, onNext }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [selectedCategory, search]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const params = {};
      if (selectedCategory) params.category = selectedCategory;
      if (search) params.search = search;
      const res = await api.get('/menu', { params });
      setItems(res.data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (item) => {
    const existing = cart.find(i => i._id === item._id);
    if (existing) {
      onUpdateCart(cart.map(i => i._id === item._id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      onUpdateCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const handleDecrement = (itemId) => {
    const existing = cart.find(i => i._id === itemId);
    if (existing.quantity <= 1) {
      onUpdateCart(cart.filter(i => i._id !== itemId));
    } else {
      onUpdateCart(cart.map(i => i._id === itemId ? { ...i, quantity: i.quantity - 1 } : i));
    }
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Table</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Table {selectedTable?.tableNumber}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items (e.g. Tikka, Mocktail)..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Categories Horizontal Selector */}
      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
          <TouchableOpacity
            style={[styles.categoryBtn, !selectedCategory && styles.categoryBtnActive]}
            onPress={() => setSelectedCategory('')}
          >
            <Text style={[styles.categoryBtnText, !selectedCategory && styles.categoryBtnTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat._id}
              style={[styles.categoryBtn, selectedCategory === cat._id && styles.categoryBtnActive]}
              onPress={() => setSelectedCategory(cat._id)}
            >
              <Text style={[styles.categoryBtnText, selectedCategory === cat._id && styles.categoryBtnTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Menu List */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Text style={styles.noItemsText}>No items found</Text>
        ) : (
          items.map((item) => {
            const cartItem = cart.find(i => i._id === item._id);
            const qty = cartItem ? cartItem.quantity : 0;

            return (
              <View key={item._id} style={styles.itemCard}>
                <View style={styles.itemDetails}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <View style={[styles.badge, item.isVeg ? styles.vegBadge : styles.nonVegBadge]} />
                    <Text style={styles.itemName}>{item.name}</Text>
                  </View>
                  <Text style={styles.itemPrice}>₹{item.price}</Text>
                </View>

                <View style={styles.actionSection}>
                  {qty > 0 ? (
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => handleDecrement(item._id)}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{qty}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => handleAdd(item)}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.addBtn, !item.isAvailable && styles.addBtnDisabled]}
                      disabled={!item.isAvailable}
                      onPress={() => handleAdd(item)}
                    >
                      <Text style={styles.addBtnText}>{item.isAvailable ? 'ADD' : 'Unavailable'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Bottom Floating Bar */}
      {cartCount > 0 && (
        <View style={styles.cartBar}>
          <View>
            <Text style={styles.cartBarCount}>{cartCount} Items Selected</Text>
            <Text style={styles.cartBarSubtotal}>₹{cartSubtotal} + GST</Text>
          </View>
          <TouchableOpacity style={styles.cartBarBtn} onPress={onNext}>
            <Text style={styles.cartBarBtnText}>View Cart →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderColor: '#111111',
  },
  backBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  backBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchSection: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F9FAFB',
    fontSize: 15,
  },
  categoriesContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderColor: '#111111',
  },
  categoriesScroll: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  categoryBtn: {
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  categoryBtnActive: {
    backgroundColor: '#7C3AED',
  },
  categoryBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  categoryBtnTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  noItemsText: {
    textAlign: 'center',
    color: '#6B7280',
    marginVertical: 40,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#111111',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  itemDetails: {
    flex: 1,
    paddingRight: 10,
  },
  badge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  vegBadge: {
    backgroundColor: '#10B981',
  },
  nonVegBadge: {
    backgroundColor: '#EF4444',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
    marginTop: 2,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
  },
  qtyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  qtyBtnText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  qtyVal: {
    paddingHorizontal: 8,
    fontWeight: '700',
  },
  addBtn: {
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  addBtnDisabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#9CA3AF',
  },
  addBtnText: {
    fontWeight: '700',
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderColor: '#111111',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  cartBarCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  cartBarSubtotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#7C3AED',
  },
  cartBarBtn: {
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cartBarBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

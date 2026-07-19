import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert } from 'react-native';

export default function RatingScreen({ api, order, onDone, onSkip }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating (1-5 stars)');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/ratings', {
        orderId: order._id,
        rating,
        comment: comment.trim()
      });
      Alert.alert('Thank You!', 'Rating submitted successfully.');
      onDone();
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to submit rating';
      if (msg.includes('already been rated')) {
        Alert.alert('Already Rated', 'This order has already been rated.');
        onDone();
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Customer Feedback</Text>
        <Text style={styles.subtitle}>
          Order #{order?.orderNumber || ''} | Table {order?.tableNumber || 'N/A'}
        </Text>

        {/* Star Rating */}
        <Text style={styles.label}>How was the experience?</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              style={styles.starBtn}
            >
              <Text style={[styles.starIcon, rating >= star && styles.starActive]}>
                {rating >= star ? '\u2605' : '\u2606'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingLabel}>
          {rating === 0 ? 'Tap to rate' :
           rating === 1 ? 'Poor' :
           rating === 2 ? 'Fair' :
           rating === 3 ? 'Good' :
           rating === 4 ? 'Very Good' : 'Excellent'}
        </Text>

        {/* Comment */}
        <Text style={styles.label}>Any comments? (Optional)</Text>
        <TextInput
          style={styles.textArea}
          value={comment}
          onChangeText={setComment}
          placeholder="Food was great, service was fast..."
          multiline
          numberOfLines={3}
        />

        {/* Actions */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F5F3FF',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 24, width: '100%',
    maxWidth: 400, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, alignSelf: 'flex-start' },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  starBtn: { padding: 4 },
  starIcon: { fontSize: 36, color: '#D1D5DB' },
  starActive: { color: '#F59E0B' },
  ratingLabel: { fontSize: 14, color: '#7C3AED', fontWeight: '600', marginBottom: 20 },
  textArea: {
    width: '100%', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top',
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#7C3AED', paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 8, width: '100%', alignItems: 'center',
  },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  skipBtn: { marginTop: 12, padding: 8 },
  skipBtnText: { color: '#9CA3AF', fontSize: 14 },
});

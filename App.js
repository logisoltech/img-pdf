import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function App() {
  const [images, setImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true); // Dark mode by default

  const theme = {
    dark: {
      background: '#121212',
      surface: '#1e1e1e',
      card: '#2d2d2d',
      text: '#ffffff',
      textSecondary: '#b0b0b0',
      border: '#333333',
      buttonPrimary: '#4a90e2',
      buttonSuccess: '#28a745',
      buttonDisabled: '#6c757d',
      imageBg: '#1a1a1a',
    },
    light: {
      background: '#f8f9fa',
      surface: '#ffffff',
      card: '#ffffff',
      text: '#212529',
      textSecondary: '#6c757d',
      border: '#e9ecef',
      buttonPrimary: '#4a90e2',
      buttonSuccess: '#28a745',
      buttonDisabled: '#6c757d',
      imageBg: '#f8f9fa',
    },
  };

  const colors = isDarkMode ? theme.dark : theme.light;

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Sorry, we need camera roll permissions to select images!'
        );
        return false;
      }
    }
    return true;
  };

  const pickImages = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset, index) => ({
          id: `${Date.now()}-${index}`,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        }));
        setImages((prev) => [...prev, ...newImages]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick images: ' + error.message);
    }
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const moveImageUp = (index) => {
    if (index === 0) return;
    const newImages = [...images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    setImages(newImages);
  };

  const moveImageDown = (index) => {
    if (index === images.length - 1) return;
    const newImages = [...images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    setImages(newImages);
  };

  const generatePDF = async () => {
    if (images.length === 0) {
      Alert.alert('No Images', 'Please select at least one image to convert to PDF.');
      return;
    }

    setIsGenerating(true);

    try {
      // Convert all images to base64 data URIs
      console.log('Starting PDF generation with', images.length, 'images');
      const imageDataPromises = images.map(async (img, index) => {
        try {
          console.log(`Reading image ${index + 1}/${images.length}...`);
          
          // Use legacy API - it works and is supported
          const base64 = await FileSystem.readAsStringAsync(img.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          console.log(`Image ${index + 1} read successfully, length: ${base64.length}`);
          
          // Determine MIME type from URI
          let mimeType = 'image/jpeg';
          if (img.uri.toLowerCase().includes('.png') || img.uri.toLowerCase().includes('png')) {
            mimeType = 'image/png';
          }
          
          return {
            ...img,
            dataUri: `data:${mimeType};base64,${base64}`,
          };
        } catch (error) {
          console.error(`Error reading image ${index + 1}:`, error);
          throw new Error(`Failed to process image ${index + 1}: ${error.message}`);
        }
      });

      console.log('Waiting for all images to be processed...');
      const imagesWithData = await Promise.all(imageDataPromises);
      console.log('All images processed, generating HTML...');

      // Create HTML content with images maintaining aspect ratio
      // A4 page dimensions: 210mm x 297mm = 794px x 1123px (at 96dpi)
      const pageWidth = 794;
      const pageHeight = 1123;
      const maxImageWidth = pageWidth;
      const maxImageHeight = pageHeight;

      const imageHTML = imagesWithData.map((img, index) => {
        const aspectRatio = img.width / img.height;
        
        // Calculate dimensions to fit within page while maintaining aspect ratio
        let imageWidth = maxImageWidth;
        let imageHeight = maxImageWidth / aspectRatio;
        
        // If height exceeds max, scale down by height instead
        if (imageHeight > maxImageHeight) {
          imageHeight = maxImageHeight;
          imageWidth = maxImageHeight * aspectRatio;
        }
        
        // Only add page break after if not the last image
        const pageBreak = index < imagesWithData.length - 1 ? 'page-break-after: always;' : '';
        
        // Calculate centering position
        const leftPos = (pageWidth - imageWidth) / 2;
        const topPos = (pageHeight - imageHeight) / 2;
        
        return `
          <div style="${pageBreak} page-break-inside: avoid; width: ${pageWidth}px; height: ${pageHeight}px; margin: 0; padding: 0; position: relative; overflow: hidden; background: none !important;">
            <img 
              src="${img.dataUri}" 
              style="position: absolute; top: ${topPos}px; left: ${leftPos}px; width: ${imageWidth}px; height: ${imageHeight}px; max-width: ${imageWidth}px; max-height: ${imageHeight}px; object-fit: contain; display: block; margin: 0; padding: 0; background: none !important;" 
              alt="Image"
            />
          </div>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              html, body {
                margin: 0;
                padding: 0;
                width: ${pageWidth}px;
                height: ${pageHeight}px;
                background: transparent !important;
              }
              @page {
                margin: 0;
                size: A4;
                background: transparent !important;
              }
              div {
                page-break-inside: avoid;
                background: transparent !important;
                margin: 0;
                padding: 0;
              }
              img {
                background: transparent !important;
              }
            </style>
          </head>
          <body>
            ${imageHTML}
          </body>
        </html>
      `;

      console.log('HTML generated, creating PDF...');
      // Generate PDF
      const { uri } = await Print.printToFileAsync({ html });
      console.log('PDF created at:', uri);

      // Save PDF based on platform
      if (Platform.OS === 'android') {
        await savePDFAndroid(uri);
      } else if (Platform.OS === 'ios') {
        await savePDFiOS(uri);
      } else {
        // Fallback for web or other platforms
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      }

      Alert.alert('Success', 'PDF generated successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      Alert.alert('Error', 'Failed to generate PDF: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const savePDFAndroid = async (pdfUri) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save PDF',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('Android save error:', error);
      Alert.alert('Error', 'Failed to save PDF: ' + error.message);
    }
  };

  const savePDFiOS = async (pdfUri) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save PDF to Files',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('iOS save error:', error);
      Alert.alert('Error', 'Failed to save PDF: ' + error.message);
    }
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.title, { color: colors.text }]}>Image to PDF</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {images.length} {images.length === 1 ? 'image' : 'images'} selected
            </Text>
          </View>
          <TouchableOpacity
            style={styles.themeToggle}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={isDarkMode ? 'light-mode' : 'dark-mode'}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {images.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={[styles.emptyStateText, { color: colors.text }]}>No images selected</Text>
            <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>
              Tap the button below to select images from your gallery
            </Text>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {images.map((item, index) => {
              const aspectRatio = item.width / item.height;
              const containerWidth = 300;
              const imageHeight = containerWidth / aspectRatio;

              return (
                <View key={item.id} style={[styles.imageCard, { backgroundColor: colors.card }]}>
                  <View style={[styles.imageWrapper, { backgroundColor: colors.imageBg }]}>
                    <Image
                      source={{ uri: item.uri }}
                      style={[styles.previewImage, { height: imageHeight }]}
                      resizeMode="contain"
                    />
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeImage(item.id)}
                    >
                      <Text style={styles.removeButtonText}>×</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <Text style={[styles.imageNumber, { color: colors.text }]}>Image {index + 1}</Text>
                    <View style={styles.reorderButtons}>
                      <TouchableOpacity
                        style={[
                          styles.reorderButton,
                          { backgroundColor: colors.buttonPrimary },
                          index === 0 && styles.reorderButtonDisabled,
                        ]}
                        onPress={() => moveImageUp(index)}
                        disabled={index === 0}
                      >
                        <MaterialIcons 
                          name="keyboard-arrow-up" 
                          size={20} 
                          color="#fff" 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.reorderButton,
                          { backgroundColor: colors.buttonPrimary },
                          index === images.length - 1 && styles.reorderButtonDisabled,
                        ]}
                        onPress={() => moveImageDown(index)}
                        disabled={index === images.length - 1}
                      >
                        <MaterialIcons 
                          name="keyboard-arrow-down" 
                          size={20} 
                          color="#fff" 
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Footer Actions */}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.buttonPrimary }]}
          onPress={pickImages}
          disabled={isGenerating}
        >
          <Text style={styles.buttonText}>
            {images.length === 0 ? 'Select Images' : 'Add More Images'}
          </Text>
        </TouchableOpacity>

        {images.length > 0 && (
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: isGenerating ? colors.buttonDisabled : colors.buttonSuccess },
            ]}
            onPress={generatePDF}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[styles.buttonText, styles.loadingText]}>Generating PDF...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Generate PDF</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  themeToggle: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  imageCard: {
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  imageWrapper: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  previewImage: {
    width: '100%',
    maxHeight: 400,
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
  },
  imageNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  reorderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderButtonDisabled: {
    backgroundColor: '#dee2e6',
    opacity: 0.5,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    marginLeft: 0,
  },
});

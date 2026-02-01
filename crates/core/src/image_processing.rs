use crate::errors::{Error, Result};
use color_quant::NeuQuant;
use image::{DynamicImage, GenericImageView};

/// Image processor for cover art
pub struct ImageProcessor;

impl ImageProcessor {
    /// Process cover image: resize to target dimensions and convert to 8bpp BMP
    pub fn process_cover(image_data: &[u8], width: u32, height: u32) -> Result<Vec<u8>> {
        let img = image::load_from_memory(image_data)
            .map_err(|e| Error::Image(format!("Failed to load image: {}", e)))?;

        Self::convert_to_8bpp_bmp(&img, width, height)
    }

    /// Convert an image buffer to 8-bit indexed BMP format
    fn convert_to_8bpp_bmp(img: &DynamicImage, width: u32, height: u32) -> Result<Vec<u8>> {
        // Resize image
        let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
        let rgba = resized.to_rgba8();

        // Quantize colors to 256 colors
        let quantizer = NeuQuant::new(10, 256, &rgba);
        let palette = quantizer.color_map_rgb();

        // Create indexed image
        let mut indexed_data = Vec::new();
        for pixel in rgba.pixels() {
            let idx = quantizer.index_of(&[pixel[0], pixel[1], pixel[2]]);
            indexed_data.push(idx as u8);
        }

        // Create BMP file
        Self::create_8bpp_bmp(width, height, &indexed_data, &palette)
    }

    /// Create an 8-bit BMP file
    fn create_8bpp_bmp(width: u32, height: u32, data: &[u8], palette: &[u8]) -> Result<Vec<u8>> {
        let mut bmp = Vec::new();

        // BMP Header
        bmp.extend_from_slice(b"BM");
        let file_size = 14 + 40 + 1024 + (width * height);
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&[0, 0, 0, 0]);
        bmp.extend_from_slice(&(14 + 40 + 1024_u32).to_le_bytes());

        // DIB Header
        bmp.extend_from_slice(&40_u32.to_le_bytes());
        bmp.extend_from_slice(&(width as i32).to_le_bytes());
        bmp.extend_from_slice(&(height as i32).to_le_bytes());
        bmp.extend_from_slice(&1_u16.to_le_bytes());
        bmp.extend_from_slice(&8_u16.to_le_bytes());
        bmp.extend_from_slice(&0_u32.to_le_bytes());
        bmp.extend_from_slice(&0_u32.to_le_bytes());
        bmp.extend_from_slice(&0_i32.to_le_bytes());
        bmp.extend_from_slice(&0_i32.to_le_bytes());
        bmp.extend_from_slice(&256_u32.to_le_bytes());
        bmp.extend_from_slice(&0_u32.to_le_bytes());

        // Color palette
        for i in 0..256 {
            let idx = i * 3;
            if idx + 2 < palette.len() {
                bmp.push(palette[idx + 2]);
                bmp.push(palette[idx + 1]);
                bmp.push(palette[idx]);
                bmp.push(0);
            } else {
                bmp.extend_from_slice(&[0, 0, 0, 0]);
            }
        }

        // Pixel data (bottom-up)
        let row_size = width as usize;
        for y in (0..height as usize).rev() {
            let row_start = y * row_size;
            bmp.extend_from_slice(&data[row_start..row_start + row_size]);
        }

        Ok(bmp)
    }

    /// Get image dimensions from image buffer
    pub fn get_dimensions(image_data: &[u8]) -> Result<(u32, u32)> {
        let img = image::load_from_memory(image_data)
            .map_err(|e| Error::Image(format!("Failed to load image: {}", e)))?;

        Ok(img.dimensions())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor_exists() {
        // Just verify the processor can be instantiated
        let _processor = ImageProcessor;
    }
}

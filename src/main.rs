// Replace runtime font loading with compile-time include
// and remove unused fs import.

use include_bytes!;

fn main() {
    // Example usage of include_bytes!
    let font_data = include_bytes!("path/to/font.ttf");
    // Initialize the font using font_data
}
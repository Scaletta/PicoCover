// Core types and error handling
pub mod errors;
pub mod game;
pub mod image_processing;

pub use errors::{Error, Result};
pub use game::GameCode;

/// Re-export commonly used types
pub mod prelude {
    pub use crate::errors::{Error, Result};
    pub use crate::game::GameCode;
    pub use crate::image_processing::ImageProcessor;
}

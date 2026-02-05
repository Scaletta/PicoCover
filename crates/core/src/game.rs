use crate::errors::{Error, Result};

/// Game code extracted from NDS or GBA file header
/// NDS: 4 bytes at offset 0x0C. Example: "NTRJ" for Japanese, "NTRE" for European, "NTRA" for American
/// GBA: 4 bytes at offset 0xAC. Example: "AXVE" for Game Boy Advance games
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GameCode(String);

impl GameCode {
    /// Create a new game code from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < 4 {
            return Err(Error::InvalidGameCode);
        }

        let code_bytes = &bytes[0..4];

        if !code_bytes.iter().all(|b| b.is_ascii_alphanumeric()) {
            return Err(Error::InvalidGameCode);
        }

        let code = String::from_utf8_lossy(code_bytes).to_string();
        Ok(GameCode(code))
    }

    /// Create from NDS file header (reads bytes 0x0C-0x10)
    pub fn from_nds_header(header: &[u8; 16]) -> Result<Self> {
        Self::from_bytes(&header[0x0C..0x10])
    }

    /// Create from GBA file header (reads bytes 0xAC-0xB0)
    pub fn from_gba_header(header: &[u8]) -> Result<Self> {
        if header.len() < 0xB0 {
            return Err(Error::InvalidGameCode);
        }

        Self::from_bytes(&header[0xAC..0xB0])
    }

    /// Get the code as a string
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Get the region code (last character)
    pub fn region(&self) -> Option<char> {
        self.0.chars().last()
    }
}

impl AsRef<str> for GameCode {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GameCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_code_from_bytes() {
        let bytes = b"NTRJ";
        let code = GameCode::from_bytes(bytes).unwrap();
        assert_eq!(code.as_str(), "NTRJ");
    }

    #[test]
    fn test_game_code_region() {
        let code = GameCode("NTRE".to_string());
        assert_eq!(code.region(), Some('E'));
    }

    #[test]
    fn test_invalid_game_code() {
        let bytes = b"";
        assert!(GameCode::from_bytes(bytes).is_err());
    }

    #[test]
    fn test_game_code_from_nds_header() {
        let mut header = [0u8; 16];
        // NDS game code at offset 0x0C-0x10
        header[0x0C] = b'N';
        header[0x0D] = b'T';
        header[0x0E] = b'R';
        header[0x0F] = b'J';
        let code = GameCode::from_nds_header(&header).unwrap();
        assert_eq!(code.as_str(), "NTRJ");
    }

    #[test]
    fn test_game_code_from_gba_header() {
        let mut header = [0u8; 0xB0];
        // GBA game code at offset 0xAC-0xB0
        header[0xAC] = b'A';
        header[0xAD] = b'X';
        header[0xAE] = b'V';
        header[0xAF] = b'E';
        let code = GameCode::from_gba_header(&header).unwrap();
        assert_eq!(code.as_str(), "AXVE");
    }
}

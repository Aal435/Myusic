use base64::Engine as _;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::Mutex;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Media::MediaPlaybackAutoRepeatMode;
use windows::Storage::Streams::DataReader;

#[derive(Debug, Clone, Serialize, Default)]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub album_art_base64: String,
    pub is_playing: bool,
    pub shuffle_active: bool,
    pub repeat_mode: String,
    pub position_ms: u64,
}

pub struct MediaController {
    manager: GlobalSystemMediaTransportControlsSessionManager,
}

impl MediaController {
    pub fn new() -> Result<Self, String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| format!("Failed to request session manager: {}", e))?
            .get()
            .map_err(|e| format!("Failed to get session manager: {}", e))?;
        Ok(Self { manager })
    }

    fn get_session(&self) -> Result<GlobalSystemMediaTransportControlsSession, String> {
        self.manager
            .GetCurrentSession()
            .map_err(|e| format!("No active media session: {}", e))
    }

    pub fn get_media_info(&self) -> Result<MediaInfo, String> {
        let session = self.get_session()?;

        let properties = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("Failed to request media properties: {}", e))?
            .get()
            .map_err(|e| format!("Failed to get media properties: {}", e))?;

        let title = properties
            .Title()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();

        let artist = properties
            .Artist()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();

        // Get playback status
        let playback_info = session
            .GetPlaybackInfo()
            .map_err(|e| format!("Failed to get playback info: {}", e))?;

        let status = playback_info
            .PlaybackStatus()
            .unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped);

        let is_playing =
            status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

        // Get album art
        let album_art_base64 = match properties.Thumbnail() {
            Ok(thumb_ref) => match self.read_thumbnail(thumb_ref) {
                Ok(b64) => b64,
                Err(_) => String::new(),
            },
            Err(_) => String::new(),
        };

        let shuffle_active = playback_info
            .IsShuffleActive()
            .and_then(|r| r.Value())
            .unwrap_or(false);

        let repeat_mode = playback_info
            .AutoRepeatMode()
            .and_then(|r| r.Value())
            .unwrap_or(MediaPlaybackAutoRepeatMode::None);

        let repeat_mode_str = match repeat_mode {
            MediaPlaybackAutoRepeatMode::Track => "track".to_string(),
            MediaPlaybackAutoRepeatMode::List => "list".to_string(),
            _ => "none".to_string(),
        };

        let position_ms = session
            .GetTimelineProperties()
            .and_then(|t| t.Position())
            .map(|ts| (ts.Duration / 10000) as u64)
            .unwrap_or(0);

        Ok(MediaInfo {
            title,
            artist,
            album_art_base64,
            is_playing,
            shuffle_active,
            repeat_mode: repeat_mode_str,
            position_ms,
        })
    }

    fn read_thumbnail(
        &self,
        thumb_ref: windows::Storage::Streams::IRandomAccessStreamReference,
    ) -> Result<String, String> {
        let stream = thumb_ref
            .OpenReadAsync()
            .map_err(|e| format!("Failed to open thumbnail stream: {}", e))?
            .get()
            .map_err(|e| format!("Failed to read thumbnail stream: {}", e))?;

        let size = stream
            .Size()
            .map_err(|e| format!("Failed to get stream size: {}", e))? as u32;

        if size == 0 {
            return Err("Empty thumbnail".to_string());
        }

        let reader = DataReader::CreateDataReader(&stream)
            .map_err(|e| format!("Failed to create data reader: {}", e))?;

        reader
            .LoadAsync(size)
            .map_err(|e| format!("Failed to load data: {}", e))?
            .get()
            .map_err(|e| format!("Failed to await data load: {}", e))?;

        let mut buffer = vec![0u8; size as usize];
        reader
            .ReadBytes(&mut buffer)
            .map_err(|e| format!("Failed to read bytes: {}", e))?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
        Ok(format!("data:image/png;base64,{}", b64))
    }

    pub fn play(&self) -> Result<(), String> {
        let session = self.get_session()?;
        session
            .TryPlayAsync()
            .map_err(|e| format!("Failed to send play command: {}", e))?
            .get()
            .map_err(|e| format!("Play command failed: {}", e))?;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let session = self.get_session()?;
        session
            .TryPauseAsync()
            .map_err(|e| format!("Failed to send pause command: {}", e))?
            .get()
            .map_err(|e| format!("Pause command failed: {}", e))?;
        Ok(())
    }

    pub fn next(&self) -> Result<(), String> {
        let session = self.get_session()?;
        session
            .TrySkipNextAsync()
            .map_err(|e| format!("Failed to send next command: {}", e))?
            .get()
            .map_err(|e| format!("Next command failed: {}", e))?;
        Ok(())
    }

    pub fn previous(&self) -> Result<(), String> {
        let session = self.get_session()?;
        session
            .TrySkipPreviousAsync()
            .map_err(|e| format!("Failed to send previous command: {}", e))?
            .get()
            .map_err(|e| format!("Previous command failed: {}", e))?;
        Ok(())
    }

    pub fn toggle_play_pause(&self) -> Result<(), String> {
        let session = self.get_session()?;
        session
            .TryTogglePlayPauseAsync()
            .map_err(|e| format!("Failed to toggle play/pause: {}", e))?
            .get()
            .map_err(|e| format!("Toggle play/pause failed: {}", e))?;
        Ok(())
    }

    pub fn toggle_shuffle(&self) -> Result<(), String> {
        let session = self.get_session()?;
        let info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
        let current = info.IsShuffleActive().and_then(|r| r.Value()).unwrap_or(false);
        session
            .TryChangeShuffleActiveAsync(!current)
            .map_err(|e| format!("Failed to send shuffle command: {}", e))?
            .get()
            .map_err(|e| format!("Shuffle command failed: {}", e))?;
        Ok(())
    }

    pub fn toggle_repeat(&self) -> Result<(), String> {
        let session = self.get_session()?;
        let info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
        let current = info
            .AutoRepeatMode()
            .and_then(|r| r.Value())
            .unwrap_or(MediaPlaybackAutoRepeatMode::None);
        
        let next_mode = match current {
            MediaPlaybackAutoRepeatMode::None => MediaPlaybackAutoRepeatMode::List,
            MediaPlaybackAutoRepeatMode::List => MediaPlaybackAutoRepeatMode::Track,
            _ => MediaPlaybackAutoRepeatMode::None,
        };

        session
            .TryChangeAutoRepeatModeAsync(next_mode)
            .map_err(|e| format!("Failed to send repeat command: {}", e))?
            .get()
            .map_err(|e| format!("Repeat command failed: {}", e))?;
        Ok(())
    }
}

// Thread-safe wrapper
pub type SharedMediaController = Arc<Mutex<Option<MediaController>>>;

pub fn create_shared_controller() -> SharedMediaController {
    Arc::new(Mutex::new(None))
}

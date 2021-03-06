/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MEDIA_CODEC_READER_H
#define MEDIA_CODEC_READER_H

#include <utils/threads.h>

#include <base/message_loop.h>

#include <mozilla/CheckedInt.h>
#include <mozilla/Mutex.h>
#include <mozilla/Monitor.h>

#include <nsDataHashtable.h>

#include "MediaData.h"

#include "I420ColorConverterHelper.h"
#include "MediaCodecProxy.h"
#include "MediaOmxCommonReader.h"

namespace android {
struct ALooper;
struct AMessage;

class MOZ_EXPORT MediaExtractor;
class MOZ_EXPORT MetaData;
class MOZ_EXPORT MediaBuffer;
struct MOZ_EXPORT MediaSource;

class GonkNativeWindow;
} // namespace android

namespace mozilla {

class FlushableMediaTaskQueue;
class MP3FrameParser;

namespace layers {
class TextureClient;
} // namespace mozilla::layers

class MediaCodecReader : public MediaOmxCommonReader
{
  typedef mozilla::layers::TextureClient TextureClient;

public:
  MediaCodecReader(AbstractMediaDecoder* aDecoder);
  virtual ~MediaCodecReader();

  // Initializes the reader, returns NS_OK on success, or NS_ERROR_FAILURE
  // on failure.
  virtual nsresult Init(MediaDecoderReader* aCloneDonor);

  // True if this reader is waiting media resource allocation
  virtual bool IsWaitingMediaResources();

  // True when this reader need to become dormant state
  virtual bool IsDormantNeeded() { return true;}

  // Release media resources they should be released in dormant state
  virtual void ReleaseMediaResources();

  // Destroys the decoding state. The reader cannot be made usable again.
  // This is different from ReleaseMediaResources() as Shutdown() is
  // irreversible, whereas ReleaseMediaResources() is reversible.
  virtual nsRefPtr<ShutdownPromise> Shutdown();

  // Used to retrieve some special information that can only be retrieved after
  // all contents have been continuously parsed. (ex. total duration of some
  // variable-bit-rate MP3 files.)
  virtual void NotifyDataArrived(const char* aBuffer, uint32_t aLength, int64_t aOffset);

  // Flush the MediaTaskQueue, flush MediaCodec and raise the mDiscontinuity.
  virtual nsresult ResetDecode() MOZ_OVERRIDE;

  // Disptach a DecodeVideoFrameTask to decode video data.
  virtual nsRefPtr<VideoDataPromise>
  RequestVideoData(bool aSkipToNextKeyframe,
                   int64_t aTimeThreshold) MOZ_OVERRIDE;

  // Disptach a DecodeAduioDataTask to decode video data.
  virtual nsRefPtr<AudioDataPromise> RequestAudioData() MOZ_OVERRIDE;

  virtual bool HasAudio();
  virtual bool HasVideo();

  virtual void PreReadMetadata() MOZ_OVERRIDE;
  // Read header data for all bitstreams in the file. Fills aInfo with
  // the data required to present the media, and optionally fills *aTags
  // with tag metadata from the file.
  // Returns NS_OK on success, or NS_ERROR_FAILURE on failure.
  virtual nsresult ReadMetadata(MediaInfo* aInfo,
                                MetadataTags** aTags);

  // Moves the decode head to aTime microseconds. aStartTime and aEndTime
  // denote the start and end times of the media in usecs, and aCurrentTime
  // is the current playback position in microseconds.
  virtual nsRefPtr<SeekPromise>
  Seek(int64_t aTime, int64_t aEndTime) MOZ_OVERRIDE;

  virtual bool IsMediaSeekable() MOZ_OVERRIDE;

  virtual android::sp<android::MediaSource> GetAudioOffloadTrack();

  virtual bool IsAsync() const MOZ_OVERRIDE { return true; }

protected:
  struct TrackInputCopier
  {
    virtual ~TrackInputCopier();

    virtual bool Copy(android::MediaBuffer* aSourceBuffer,
                      android::sp<android::ABuffer> aCodecBuffer);
  };

  struct Track
  {
    enum Type
    {
      kUnknown = 0,
      kAudio,
      kVideo,
    };

    Track(Type type=kUnknown);

    const Type mType;

    // pipeline parameters
    android::sp<android::MediaSource> mSource;
    bool mSourceIsStopped;
    android::sp<android::MediaCodecProxy> mCodec;
    android::Vector<android::sp<android::ABuffer> > mInputBuffers;
    android::Vector<android::sp<android::ABuffer> > mOutputBuffers;
    android::sp<android::GonkNativeWindow> mNativeWindow;
#if ANDROID_VERSION >= 21
    android::sp<android::IGraphicBufferProducer> mGraphicBufferProducer;
#endif

    // pipeline copier
    nsAutoPtr<TrackInputCopier> mInputCopier;

    // media parameters
    Mutex mDurationLock; // mDurationUs might be read or updated from multiple
                         // threads.
    int64_t mDurationUs;

    // playback parameters
    CheckedUint32 mInputIndex;
    // mDiscontinuity, mFlushed, mInputEndOfStream, mInputEndOfStream,
    // mSeekTimeUs don't be protected by a lock because the
    // mTaskQueue->Flush() will flush all tasks.
    bool mInputEndOfStream;
    bool mOutputEndOfStream;
    int64_t mSeekTimeUs;
    bool mFlushed; // meaningless when mSeekTimeUs is invalid.
    bool mDiscontinuity;
    nsRefPtr<FlushableMediaTaskQueue> mTaskQueue;

  private:
    // Forbidden
    Track(const Track &rhs) = delete;
    const Track &operator=(const Track&) = delete;
  };

  // Receive a message from MessageHandler.
  // Called on MediaCodecReader::mLooper thread.
  void onMessageReceived(const android::sp<android::AMessage>& aMessage);

  // Receive a notify from ResourceListener.
  // Called on Binder thread.
  virtual void codecReserved(Track& aTrack);
  virtual void codecCanceled(Track& aTrack);

  virtual bool CreateExtractor();

  // Check the underlying HW resource is available and store the result in
  // mIsWaitingResources.
  void UpdateIsWaitingMediaResources();

  android::sp<android::MediaExtractor> mExtractor;
  // A cache value updated by UpdateIsWaitingMediaResources(), makes the
  // "waiting resources state" is synchronous to StateMachine.
  bool mIsWaitingResources;

private:
  // An intermediary class that can be managed by android::sp<T>.
  // Redirect onMessageReceived() to MediaCodecReader.
  class MessageHandler : public android::AHandler
  {
  public:
    MessageHandler(MediaCodecReader* aReader);
    ~MessageHandler();

    virtual void onMessageReceived(const android::sp<android::AMessage>& aMessage);

  private:
    // Forbidden
    MessageHandler() = delete;
    MessageHandler(const MessageHandler& rhs) = delete;
    const MessageHandler& operator=(const MessageHandler& rhs) = delete;

    MediaCodecReader *mReader;
  };
  friend class MessageHandler;

  // An intermediary class that can be managed by android::sp<T>.
  // Redirect codecReserved() and codecCanceled() to MediaCodecReader.
  class VideoResourceListener : public android::MediaCodecProxy::CodecResourceListener
  {
  public:
    VideoResourceListener(MediaCodecReader* aReader);
    ~VideoResourceListener();

    virtual void codecReserved();
    virtual void codecCanceled();

  private:
    // Forbidden
    VideoResourceListener() = delete;
    VideoResourceListener(const VideoResourceListener& rhs) = delete;
    const VideoResourceListener& operator=(const VideoResourceListener& rhs) = delete;

    MediaCodecReader* mReader;
  };
  friend class VideoResourceListener;

  class VorbisInputCopier : public TrackInputCopier
  {
    virtual bool Copy(android::MediaBuffer* aSourceBuffer,
                      android::sp<android::ABuffer> aCodecBuffer);
  };

  struct AudioTrack : public Track
  {
    AudioTrack();

  private:
    // Forbidden
    AudioTrack(const AudioTrack &rhs) = delete;
    const AudioTrack &operator=(const AudioTrack &rhs) = delete;
  };

  struct VideoTrack : public Track
  {
    VideoTrack();

    int32_t mWidth;
    int32_t mHeight;
    int32_t mStride;
    int32_t mSliceHeight;
    int32_t mColorFormat;
    int32_t mRotation;
    nsIntSize mFrameSize;
    nsIntRect mPictureRect;
    gfx::IntRect mRelativePictureRect;

  private:
    // Forbidden
    VideoTrack(const VideoTrack &rhs) = delete;
    const VideoTrack &operator=(const VideoTrack &rhs) = delete;
  };

  struct CodecBufferInfo
  {
    CodecBufferInfo();

    android::sp<android::ABuffer> mBuffer;
    size_t mIndex;
    size_t mOffset;
    size_t mSize;
    int64_t mTimeUs;
    uint32_t mFlags;
  };

  class SignalObject
  {
  public:
    NS_INLINE_DECL_THREADSAFE_REFCOUNTING(SignalObject)

    SignalObject(const char* aName);
    ~SignalObject();
    void Wait();
    void Signal();

  private:
    // Forbidden
    SignalObject() = delete;
    SignalObject(const SignalObject &rhs) = delete;
    const SignalObject &operator=(const SignalObject &rhs) = delete;

    Monitor mMonitor;
    bool mSignaled;
  };

  class ParseCachedDataRunnable : public nsRunnable
  {
  public:
    ParseCachedDataRunnable(nsRefPtr<MediaCodecReader> aReader,
                            const char* aBuffer,
                            uint32_t aLength,
                            int64_t aOffset,
                            nsRefPtr<SignalObject> aSignal);

    NS_IMETHOD Run() MOZ_OVERRIDE;

  private:
    // Forbidden
    ParseCachedDataRunnable() = delete;
    ParseCachedDataRunnable(const ParseCachedDataRunnable &rhs) = delete;
    const ParseCachedDataRunnable &operator=(const ParseCachedDataRunnable &rhs) = delete;

    nsRefPtr<MediaCodecReader> mReader;
    nsAutoArrayPtr<const char> mBuffer;
    uint32_t mLength;
    int64_t mOffset;
    nsRefPtr<SignalObject> mSignal;
  };
  friend class ParseCachedDataRunnable;

  class ProcessCachedDataTask : public Task
  {
  public:
    ProcessCachedDataTask(nsRefPtr<MediaCodecReader> aReader,
                          int64_t aOffset);

    void Run() MOZ_OVERRIDE;

  private:
    // Forbidden
    ProcessCachedDataTask() = delete;
    ProcessCachedDataTask(const ProcessCachedDataTask &rhs) = delete;
    const ProcessCachedDataTask &operator=(const ProcessCachedDataTask &rhs) = delete;

    nsRefPtr<MediaCodecReader> mReader;
    int64_t mOffset;
  };
  friend class ProcessCachedDataTask;

  // Forbidden
  MediaCodecReader() = delete;
  const MediaCodecReader& operator=(const MediaCodecReader& rhs) = delete;

  bool ReallocateResources();
  void ReleaseCriticalResources();
  void ReleaseResources();

  bool CreateLooper();
  void DestroyLooper();

  void DestroyExtractor();

  bool CreateMediaSources();
  void DestroyMediaSources();

  bool CreateMediaCodecs();
  static bool CreateMediaCodec(android::sp<android::ALooper>& aLooper,
                               Track& aTrack,
                               bool aAsync,
                               android::wp<android::MediaCodecProxy::CodecResourceListener> aListener);
  static bool ConfigureMediaCodec(Track& aTrack);
  void DestroyMediaCodecs();
  static void DestroyMediaCodec(Track& aTrack);

  bool CreateTaskQueues();
  void ShutdownTaskQueues();
  bool DecodeVideoFrameTask(int64_t aTimeThreshold);
  bool DecodeVideoFrameSync(int64_t aTimeThreshold);
  bool DecodeAudioDataTask();
  bool DecodeAudioDataSync();
  void DispatchVideoTask(int64_t aTimeThreshold);
  void DispatchAudioTask();
  inline bool CheckVideoResources() {
    return (HasVideo() && mVideoTrack.mSource != nullptr &&
            mVideoTrack.mTaskQueue);
  }

  inline bool CheckAudioResources() {
    return (HasAudio() && mAudioTrack.mSource != nullptr &&
            mAudioTrack.mTaskQueue);
  }

  bool TriggerIncrementalParser();

  bool UpdateDuration();
  bool UpdateAudioInfo();
  bool UpdateVideoInfo();

  android::status_t FlushCodecData(Track& aTrack);
  android::status_t FillCodecInputData(Track& aTrack);
  android::status_t GetCodecOutputData(Track& aTrack,
                                       CodecBufferInfo& aBuffer,
                                       int64_t aThreshold,
                                       const TimeStamp& aTimeout);
  bool EnsureCodecFormatParsed(Track& aTrack);

  uint8_t* GetColorConverterBuffer(int32_t aWidth, int32_t aHeight);
  void ClearColorConverterBuffer();

  int64_t ProcessCachedData(int64_t aOffset,
                            nsRefPtr<SignalObject> aSignal);
  bool ParseDataSegment(const char* aBuffer,
                        uint32_t aLength,
                        int64_t aOffset);

  static void TextureClientRecycleCallback(TextureClient* aClient,
                                           void* aClosure);
  void TextureClientRecycleCallback(TextureClient* aClient);

  void ReleaseRecycledTextureClients();
  static PLDHashOperator ReleaseTextureClient(TextureClient* aClient,
                                              size_t& aIndex,
                                              void* aUserArg);
  PLDHashOperator ReleaseTextureClient(TextureClient* aClient,
                                       size_t& aIndex);

  void ReleaseAllTextureClients();

  android::sp<MessageHandler> mHandler;
  android::sp<VideoResourceListener> mVideoListener;

  android::sp<android::ALooper> mLooper;
  android::sp<android::MetaData> mMetaData;

  Mutex mTextureClientIndexesLock;
  nsDataHashtable<nsPtrHashKey<TextureClient>, size_t> mTextureClientIndexes;

  // media tracks
  AudioTrack mAudioTrack;
  VideoTrack mVideoTrack;
  AudioTrack mAudioOffloadTrack; // only Track::mSource is valid

  MediaPromiseHolder<AudioDataPromise> mAudioPromise;
  MediaPromiseHolder<VideoDataPromise> mVideoPromise;

  // color converter
  android::I420ColorConverterHelper mColorConverter;
  nsAutoArrayPtr<uint8_t> mColorConverterBuffer;
  size_t mColorConverterBufferSize;

  // incremental parser
  Monitor mParserMonitor;
  bool mParseDataFromCache;
  int64_t mNextParserPosition;
  int64_t mParsedDataLength;
  nsAutoPtr<MP3FrameParser> mMP3FrameParser;
};

} // namespace mozilla

#endif // MEDIA_CODEC_READER_H

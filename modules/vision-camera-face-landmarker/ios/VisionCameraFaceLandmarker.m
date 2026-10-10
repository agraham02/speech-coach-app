#import <Foundation/Foundation.h>
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>

#if __has_include("VisionCameraFaceLandmarker/VisionCameraFaceLandmarker-Swift.h")
#import "VisionCameraFaceLandmarker/VisionCameraFaceLandmarker-Swift.h"
#else
#import "VisionCameraFaceLandmarker-Swift.h"
#endif

@interface VisionCameraFaceLandmarker (FrameProcessorPluginLoader)
@end

@implementation VisionCameraFaceLandmarker (FrameProcessorPluginLoader)
+ (void)load {
  [FrameProcessorPluginRegistry addFrameProcessorPlugin:@"detectFaceLandmarks"
                                        withInitializer:^FrameProcessorPlugin*(VisionCameraProxyHolder* proxy, NSDictionary* options) {
    return [[VisionCameraFaceLandmarker alloc] initWithProxy:proxy withOptions:options];
  }];
}
@end

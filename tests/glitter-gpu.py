"""通过系统 OpenGL 离屏核对像素数值；无窗口、截图、第三方依赖或编译步骤。"""
import ctypes as C
import json
import math
import sys

source = json.load(sys.stdin)
lib = C.CDLL('/System/Library/Frameworks/OpenGL.framework/OpenGL')
I, U, F, P = C.c_int, C.c_uint, C.c_float, C.c_void_p


def api(name, result, *args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = result, args
    return fn


choose = api('CGLChoosePixelFormat', I, C.POINTER(I), C.POINTER(P), C.POINTER(I))
create = api('CGLCreateContext', I, P, P, C.POINTER(P))
current = api('CGLSetCurrentContext', I, P)
destroy = api('CGLDestroyContext', I, P)
pixel_format, count, context = P(), I(), P()
assert choose((I * 7)(73, 96, 8, 24, 11, 8, 0), C.byref(pixel_format), C.byref(count)) == 0 and count.value
assert create(pixel_format, None, C.byref(context)) == 0, '无法建立系统离屏图形上下文'
api('CGLDestroyPixelFormat', I, P)(pixel_format)
assert current(context) == 0

shader_new = api('glCreateShader', U, U)
shader_source = api('glShaderSource', None, U, I, C.POINTER(C.c_char_p), P)
compile_shader = api('glCompileShader', None, U)
shader_status = api('glGetShaderiv', None, U, U, C.POINTER(I))
shader_log = api('glGetShaderInfoLog', None, U, I, P, P)
program_new = api('glCreateProgram', U)
attach = api('glAttachShader', None, U, U)
link = api('glLinkProgram', None, U)
program_status = api('glGetProgramiv', None, U, U, C.POINTER(I))
program_log = api('glGetProgramInfoLog', None, U, I, P, P)
use = api('glUseProgram', None, U)
uniform = api('glGetUniformLocation', I, U, C.c_char_p)
u1f = api('glUniform1f', None, I, F)
u1i = api('glUniform1i', None, I, I)
u2f = api('glUniform2f', None, I, F, F)
attribute = api('glGetAttribLocation', I, U, C.c_char_p)
a2f = api('glVertexAttrib2f', None, U, F, F)
a3f = api('glVertexAttrib3f', None, U, F, F, F)
a4f = api('glVertexAttrib4f', None, U, F, F, F, F)
enable_attribute = api('glEnableVertexAttribArray', None, U)
attribute_pointer = api('glVertexAttribPointer', None, U, I, U, C.c_ubyte, I, P)
textures_new = api('glGenTextures', None, I, C.POINTER(U))
texture_bind = api('glBindTexture', None, U, U)
texture_parameter = api('glTexParameteri', None, U, U, I)
texture_image = api('glTexImage2D', None, U, I, I, I, I, I, U, U, P)
texture_sub_image = api('glTexSubImage2D', None, U, I, I, I, I, I, U, U, P)
framebuffers_new = api('glGenFramebuffersEXT', None, I, C.POINTER(U))
framebuffer_bind = api('glBindFramebufferEXT', None, U, U)
framebuffer_texture = api('glFramebufferTexture2DEXT', None, U, U, U, U, I)
framebuffer_status = api('glCheckFramebufferStatusEXT', U, U)
draw = api('glDrawArrays', None, U, I, I)
clear = api('glClear', None, U)
read = api('glReadPixels', None, I, I, I, I, U, U, P)
error = api('glGetError', U)


def compile_program():
    program = program_new()
    for kind, key in [(0x8B31, 'vertex'), (0x8B30, 'fragment')]:
        shader = shader_new(kind)
        text = C.c_char_p(source[key].encode())
        shader_source(shader, 1, C.byref(text), None)
        compile_shader(shader)
        ok = I()
        shader_status(shader, 0x8B81, C.byref(ok))
        log = C.create_string_buffer(4096)
        shader_log(shader, len(log), None, log)
        assert ok.value, log.value.decode()
        attach(program, shader)
        api('glDeleteShader', None, U)(shader)
    link(program)
    ok, log = I(), C.create_string_buffer(4096)
    program_status(program, 0x8B82, C.byref(ok))
    program_log(program, len(log), None, log)
    assert ok.value, log.value.decode()
    return program


try:
    program = compile_program()
    use(program)
    side, rgba, byte, tex2d = 64, 0x1908, 0x1401, 0x0DE1
    target, fbo, mask = U(), U(), U()
    textures_new(1, C.byref(target))
    texture_bind(tex2d, target)
    texture_image(tex2d, 0, 0x8058, side, side, 0, rgba, byte, None)
    framebuffers_new(1, C.byref(fbo))
    framebuffer_bind(0x8D40, fbo)
    framebuffer_texture(0x8D40, 0x8CE0, tex2d, target, 0)
    assert framebuffer_status(0x8D40) == 0x8CD5, '离屏绘制目标不完整'
    textures_new(1, C.byref(mask))
    texture_bind(tex2d, mask)
    for key, value in [(0x2801, 0x2601), (0x2800, 0x2601), (0x2802, 0x812F), (0x2803, 0x812F)]:
        texture_parameter(tex2d, key, value)
    mask_data = (C.c_ubyte * (side * side * 4))()
    texture_image(tex2d, 0, rgba, side, side, 0, rgba, byte, mask_data)
    u1i(uniform(program, b'u_mask'), 0)
    u2f(uniform(program, b'u_cell'), 1, 1)
    a2f(attribute(program, b'a_origin'), 0, 0)
    quad = (F * 12)(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1)
    for name in [b'a_uv', b'a_position']:
        at = attribute(program, name)
        enable_attribute(at)
        attribute_pointer(at, 2, 0x1406, 0, 0, quad)
    api('glViewport', None, I, I, I, I)(0, 0, side, side)
    api('glDisable', None, U)(0x0BE2)
    api('glClearColor', None, F, F, F, F)(0, 0, 0, 0)

    def frame(time, tilt=0, gold=1, gain=1, glint=(.74, .5, 0), material=None, pose=None):
        u1f(uniform(program, b'u_time'), time)
        a4f(attribute(program, b'a_pose'), *(pose or (tilt, 0, .4, gain)))
        a4f(attribute(program, b'a_material'), *(material or (7.19, gold, 16, .5)))
        a3f(attribute(program, b'a_glint'), *glint)
        clear(0x4000)
        draw(4, 0, 6)
        pixels = (C.c_ubyte * (side * side * 4))()
        read(0, 0, side, side, rgba, byte, pixels)
        assert error() == 0, '显卡离屏绘制失败'
        return bytes(pixels)

    assert not any(frame(5, glint=(.74, .5, 1))), '没有真实遮罩覆盖时，强峰也不能凭空产生闪点'
    for y in range(side):
        for x in range(side):
            r = math.hypot((x + .5) / side - .5, (y + .5) / side - .5)
            if .16 < r < .36:
                mask_data[(y * side + x) * 4:(y * side + x) * 4 + 4] = [255] * 4
    texture_sub_image(tex2d, 0, 0, 0, side, side, rgba, byte, mask_data)
    a, b, c = frame(5), frame(7), frame(5)
    assert a == c, '暂停回拖应重现相同像素'
    assert a != b, '表面法线应随时间改变反光'
    assert a != frame(5, tilt=.6), '表面转动应改变反光'
    assert not any(frame(5, gain=0)), '结束或减少动态时不留残光'
    assert not any(frame(5, gain=0, glint=(.74, .5, 1))), '结束或减少动态时共享强峰也必须清空'
    assert frame(5, glint=(.5, .5, 1)) == frame(5), '强峰放在空心孔时不能产生白核或泛光'

    # 使用 JavaScript 真实输出的锚点与迎光峰；核对其确实改变显卡像素，而非只检查接口数值。
    probe = source['probe']
    u, v, energy = probe['glint']
    assert .16 < math.hypot(u - .5, v - .5) < .36 and energy > .1
    options = dict(material=probe['material'], pose=probe['pose'])
    dim = frame(probe['time'], glint=(u, v, 0), **options)
    strong = frame(probe['time'], glint=(u, v, energy), **options)
    weak = frame(probe['time'], glint=(u, v, energy * .25), **options)
    additions = [max(0, bright - faint) for bright, faint in zip(strong[3::4], dim[3::4])]
    weak_energy = sum(max(0, bright - faint) for bright, faint in zip(weak[3::4], dim[3::4]))
    assert sum(additions) > weak_energy > 0, '传入的同一反射峰必须连续控制实际白核和泛光'
    cx, cy = u * side - .5, (1 - v) * side - .5
    near_source = sum(value for i, value in enumerate(additions)
                      if math.hypot(i % side - cx, i // side - cy) < 3)
    assert near_source > sum(additions) * .55, '最亮能量必须集中在真实反光源附近'
    assert max(strong[3::4]) >= 240, '强峰需要清楚的白亮核'

    # 小于一纹素的移动不会丢失大部分亮核能量；模拟图集采样相位变化，不读取浏览器画面。
    def glint_energy(offset):
        base = frame(5)
        pixels = frame(5, glint=(.74 + offset / side, .5, .8))
        return sum(max(0, light - dark) for light, dark in zip(pixels[3::4], base[3::4]))

    subpixel = [glint_energy(offset) for offset in (0, .2, .4, .6, .8)]
    assert min(subpixel) > max(subpixel) * .75, '亮核能量不能因亚像素位置而大幅跳变'
    bright = visible = maximum = 0
    for f in range(100):
        pixels = frame(f * .13)
        alpha = pixels[3::4]
        count = sum(v > 220 for v in alpha)
        bright += count
        visible += sum(v > 10 for v in alpha)
        maximum = max(maximum, count)
        assert all(max(rgb) <= a for rgb, a in zip(zip(pixels[0::4], pixels[1::4], pixels[2::4]), alpha)), '预乘透明度不正确'
    assert bright > 0 and visible > 100, '反光阈值过高，无法看见'
    assert bright < 100 * side * side * .04 and maximum < side * side * .08, '极亮像素过密'
    assert frame(8, gold=1) != frame(8, gold=0), '金银反光应可区分'
    print(f'显卡检查通过：实际编译与链接、共享强峰的亮核/泛光、空心孔、亚像素能量、姿态响应、回拖与金银区分；细反射强亮像素占 {100 * bright / (100 * side * side):.3f}%，单帧最高 {maximum}；共享峰能量 {energy:.3f}。')
finally:
    current(None)
    destroy(context)

// Pack dependencies PyPI publishes no wheel for on a release platform; the pack build compiles
// each pinned sdist with the builder CPython. Versions must match worker/requirements-pack-*.txt.
// CMake reads a backslash in a -D value as an escape; forward slashes work on every platform.
const cmakePath = (file) => file.replaceAll('\\', '/');

export const SOURCE_BUILDS = {
  // No cp314 win_amd64 wheel: CMake + the runner's MSVC build the extension.
  'win32-x64': [
    {
      name: 'kaldi-native-fbank',
      version: '1.22.3',
      url: 'https://files.pythonhosted.org/packages/3a/2c/84076b352107ce12d56f28c313f1aca1be332d953dd96aec7b84976e6d53/kaldi-native-fbank-1.22.3.tar.gz',
      sha256: '387bf87225c6b83c93ae652eeaef1b4d531994b6e398e7a77189de340674f9af',
      // pybind11 3 finds Python through `Python_EXECUTABLE`; without it CMake may pick another one.
      env: (python) => ({
        KALDI_NATIVE_FBANK_CMAKE_ARGS: `-DCMAKE_BUILD_TYPE=Release -DPython_EXECUTABLE=${cmakePath(python)} -DPYTHON_EXECUTABLE=${cmakePath(python)}`,
      }),
    },
  ],
};

"""World constants shared by every shot: sky orientation, track, platform."""
import math

import numpy as np


def _dir(az_deg, el_deg):
    """az measured from +x toward -z (so az=90 is straight ahead for a yaw=0 camera)."""
    a, e = math.radians(az_deg), math.radians(el_deg)
    return np.array([math.cos(e) * math.cos(a), math.sin(e), -math.cos(e) * math.sin(a)])


# Milky Way: core low over the far +x horizon, arching up over the sea to the upper left.
MW_CORE = _dir(60.0, 12.0)
_MW_OTHER = _dir(160.0, 52.0)
MW_POLE = np.cross(MW_CORE, _MW_OTHER)
MW_POLE /= np.linalg.norm(MW_POLE)


def sky_uniforms(cloud_shift=0.0):
    return {'u_mwA': tuple(MW_CORE), 'u_mwP': tuple(MW_POLE), 'u_cloudShift': cloud_shift}

window.SOLAR_DATA = {
  "meta": {
    "unit_scene_bu_km": 1000,
    "epoch_jd_tt": 2451545.0,
    "stage": "2",
    "orbit_source": "JPL SSD Approximate Positions of the Planets, Table 1, 1800-2050",
    "orbit_source_url": "https://ssd.jpl.nasa.gov/planets/approx_pos.html"
  },
  "bodies": [
    {
      "name": "Sun",
      "type": "star",
      "radius_km": 696340.0,
      "semi_major_au": 0.0,
      "rotation_period_h": 609.12,
      "axial_tilt_deg": 7.25
    },
    {
      "name": "Mercury",
      "type": "planet",
      "radius_km": 2439.7,
      "semi_major_au": 0.3871,
      "rotation_period_h": 1407.6,
      "axial_tilt_deg": 0.03,
      "orbit_j2000": {
        "a_au": 0.38709927,
        "a_rate": 3.7e-07,
        "e": 0.20563593,
        "e_rate": 1.906e-05,
        "i_deg": 7.00497902,
        "i_rate": -0.00594749,
        "L_deg": 252.2503235,
        "L_rate": 149472.67411175,
        "peri_deg": 77.45779628,
        "peri_rate": 0.16047689,
        "node_deg": 48.33076593,
        "node_rate": -0.12534081
      }
    },
    {
      "name": "Venus",
      "type": "planet",
      "radius_km": 6051.8,
      "semi_major_au": 0.7233,
      "rotation_period_h": -5832.5,
      "axial_tilt_deg": 177.36,
      "orbit_j2000": {
        "a_au": 0.72333566,
        "a_rate": 3.9e-06,
        "e": 0.00677672,
        "e_rate": -4.107e-05,
        "i_deg": 3.39467605,
        "i_rate": -0.0007889,
        "L_deg": 181.9790995,
        "L_rate": 58517.81538729,
        "peri_deg": 131.60246718,
        "peri_rate": 0.00268329,
        "node_deg": 76.67984255,
        "node_rate": -0.27769418
      }
    },
    {
      "name": "Earth",
      "type": "planet",
      "radius_km": 6371.0,
      "semi_major_au": 1.0,
      "rotation_period_h": 23.934,
      "axial_tilt_deg": 23.44,
      "orbit_j2000": {
        "a_au": 1.00000261,
        "a_rate": 5.62e-06,
        "e": 0.01671123,
        "e_rate": -4.392e-05,
        "i_deg": -1.531e-05,
        "i_rate": -0.01294668,
        "L_deg": 100.46457166,
        "L_rate": 35999.37244981,
        "peri_deg": 102.93768193,
        "peri_rate": 0.32327364,
        "node_deg": 0.0,
        "node_rate": 0.0,
        "source_body": "EM Bary"
      }
    },
    {
      "name": "Mars",
      "type": "planet",
      "radius_km": 3389.5,
      "semi_major_au": 1.5237,
      "rotation_period_h": 24.623,
      "axial_tilt_deg": 25.19,
      "orbit_j2000": {
        "a_au": 1.52371034,
        "a_rate": 1.847e-05,
        "e": 0.0933941,
        "e_rate": 7.882e-05,
        "i_deg": 1.84969142,
        "i_rate": -0.00813131,
        "L_deg": -4.55343205,
        "L_rate": 19140.30268499,
        "peri_deg": -23.94362959,
        "peri_rate": 0.44441088,
        "node_deg": 49.55953891,
        "node_rate": -0.29257343
      }
    },
    {
      "name": "Jupiter",
      "type": "planet",
      "radius_km": 69911.0,
      "semi_major_au": 5.2029,
      "rotation_period_h": 9.925,
      "axial_tilt_deg": 3.13,
      "orbit_j2000": {
        "a_au": 5.202887,
        "a_rate": -0.00011607,
        "e": 0.04838624,
        "e_rate": -0.00013253,
        "i_deg": 1.30439695,
        "i_rate": -0.00183714,
        "L_deg": 34.39644051,
        "L_rate": 3034.74612775,
        "peri_deg": 14.72847983,
        "peri_rate": 0.21252668,
        "node_deg": 100.47390909,
        "node_rate": 0.20469106
      }
    },
    {
      "name": "Saturn",
      "type": "planet",
      "radius_km": 58232.0,
      "semi_major_au": 9.5367,
      "rotation_period_h": 10.66,
      "axial_tilt_deg": 26.73,
      "orbit_j2000": {
        "a_au": 9.53667594,
        "a_rate": -0.0012506,
        "e": 0.05386179,
        "e_rate": -0.00050991,
        "i_deg": 2.48599187,
        "i_rate": 0.00193609,
        "L_deg": 49.95424423,
        "L_rate": 1222.49362201,
        "peri_deg": 92.59887831,
        "peri_rate": -0.41897216,
        "node_deg": 113.66242448,
        "node_rate": -0.28867794
      }
    },
    {
      "name": "Uranus",
      "type": "planet",
      "radius_km": 25362.0,
      "semi_major_au": 19.191,
      "rotation_period_h": -17.24,
      "axial_tilt_deg": 97.77,
      "orbit_j2000": {
        "a_au": 19.18916464,
        "a_rate": -0.00196176,
        "e": 0.04725744,
        "e_rate": -4.397e-05,
        "i_deg": 0.77263783,
        "i_rate": -0.00242939,
        "L_deg": 313.23810451,
        "L_rate": 428.48202785,
        "peri_deg": 170.9542763,
        "peri_rate": 0.40805281,
        "node_deg": 74.01692503,
        "node_rate": 0.04240589
      }
    },
    {
      "name": "Neptune",
      "type": "planet",
      "radius_km": 24622.0,
      "semi_major_au": 30.069,
      "rotation_period_h": 16.11,
      "axial_tilt_deg": 28.32,
      "orbit_j2000": {
        "a_au": 30.06992276,
        "a_rate": 0.00026291,
        "e": 0.00859048,
        "e_rate": 5.105e-05,
        "i_deg": 1.77004347,
        "i_rate": 0.00035372,
        "L_deg": -55.12002969,
        "L_rate": 218.45945325,
        "peri_deg": 44.96476227,
        "peri_rate": -0.32241464,
        "node_deg": 131.78422574,
        "node_rate": -0.00508664
      }
    }
  ]
};

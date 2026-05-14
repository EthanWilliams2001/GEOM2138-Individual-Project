/**** GREAT OTWAY NDVI SPLIT PANEL APP
     7 regions
     Sentinel-2 + Landsat 8
     Split panel + date comparison + charts
****/

// Regions.
var regions = {
  'Cape Otway': table,
  'Anglesea': table2,
  'Beech Forest': table3,
  'Lorne': table4,
  'Kennett River': table5,
  'Wye River': table6,
  'Aireys Inlet': table7,
  'Apollo Bay': table8,
  'Barramunga': table9,
  'Hordern Vale': table10,
  'Tanybryn': table11
};

// Date range. 
var appStart = '2025-12-01';
var appEnd = '2026-03-31';

// Larger window = better coverage and fewer empty/cloudy outputs.
var compositeDays = 60;

// Land mask. 
var water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence');

// Keep land only.
var landMask = water.eq(0).unmask(1);

// NDVI Visualisation. 
var ndviViz = {
  min: 0.1,
  max: 0.85,
  palette: [
    '8c510a',
    'd8b365',
    'f6e8c3',
    'c7eae5',
    '5ab4ac',
    '01665e'
  ]
};

// SENTINEL-2
function maskS2(image) {
  var scl = image.select('SCL');

  // Keep vegetation, bare soil, water-free land surfaces.
  // Remove cloud shadow, clouds, cirrus, snow.
  var mask = scl.neq(3)   // cloud shadow
    .and(scl.neq(8))      // medium probability cloud
    .and(scl.neq(9))      // high probability cloud
    .and(scl.neq(10))     // cirrus
    .and(scl.neq(11));    // snow / ice

  return image
    .updateMask(mask)
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

function sentinelNDVI(aoi, start, end) {
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
    .map(maskS2);

  var empty = ee.Image.constant(0)
    .rename('NDVI')
    .updateMask(ee.Image.constant(0))
    .clip(aoi);

  var ndvi = ee.Image(
    ee.Algorithms.If(
      collection.size().gt(0),
      collection
        .median()
        .normalizedDifference(['B8', 'B4'])
        .rename('NDVI')
        .updateMask(landMask)
        .clip(aoi),
      empty
    )
  );

  return ndvi;
}

// LANDSAT 
function maskL8(image) {
  var qa = image.select('QA_PIXEL');

  var cloudShadow = 1 << 4;
  var cloud = 1 << 3;
  var cirrus = 1 << 2;

  var mask = qa.bitwiseAnd(cloudShadow).eq(0)
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(cirrus).eq(0));

  var red = image.select('SR_B4')
    .multiply(0.0000275)
    .add(-0.2);

  var nir = image.select('SR_B5')
    .multiply(0.0000275)
    .add(-0.2);

  return image
    .addBands(red.rename('red'), null, true)
    .addBands(nir.rename('nir'), null, true)
    .updateMask(mask)
    .copyProperties(image, ['system:time_start']);
}

function landsatNDVI(aoi, start, end) {
  var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(aoi)
    .filterDate(start, end)
    .map(maskL8);

  var empty = ee.Image.constant(0)
    .rename('NDVI')
    .updateMask(ee.Image.constant(0))
    .clip(aoi);

  var ndvi = ee.Image(
    ee.Algorithms.If(
      collection.size().gt(0),
      collection
        .median()
        .normalizedDifference(['nir', 'red'])
        .rename('NDVI')
        .updateMask(landMask)
        .clip(aoi),
      empty
    )
  );

  return ndvi;
}

// NDVI function. 
function getNDVI(sensor, aoi, dateText) {
  var start = ee.Date(dateText);
  var end = start.advance(compositeDays, 'day');

  if (sensor === 'Sentinel-2') {
    return sentinelNDVI(aoi, start, end);
  } else {
    return landsatNDVI(aoi, start, end);
  }
}

// Chart functions. 
function getDateRangeChart(sensor, aoi, regionName, startText, endText) {
  var start = ee.Date(startText);
  var end = ee.Date(endText);

  var months = end.difference(start, 'month').round();

  var monthly = ee.ImageCollection.fromImages(
    ee.List.sequence(0, months).map(function(m) {
      var monthStart = start.advance(m, 'month');
      var monthEnd = monthStart.advance(1, 'month');

      var ndvi;

      if (sensor === 'Sentinel-2') {
        ndvi = sentinelNDVI(aoi, monthStart, monthEnd);
      } else {
        ndvi = landsatNDVI(aoi, monthStart, monthEnd);
      }

      return ndvi
        .set('system:time_start', monthStart.millis())
        .set('month', monthStart.format('YYYY-MM'));
    })
  );

  var chart = ui.Chart.image.series({
    imageCollection: monthly,
    region: aoi,
    reducer: ee.Reducer.mean(),
    scale: 60,
    xProperty: 'system:time_start'
  }).setOptions({
    title: 'NDVI: ' + regionName,
    hAxis: {
      title: 'Date',
      textStyle: {fontSize: 9}
    },
    vAxis: {
      title: 'Mean NDVI',
      textStyle: {fontSize: 9},
      viewWindow: {
        min: 0.4,
        max: 1.0
      }
    },
    lineWidth: 1,
    pointSize: 3,
    legend: {position: 'none'},
    chartArea: {
      left: 45,
      top: 25,
      width: '75%',
      height: '60%'
    }
  });

  chart.style().set({
    width: '340px',
    height: '150px',
    margin: '0px'
  });

  return chart;
}

// Map setup. 
var leftMap = ui.Map();
var rightMap = ui.Map();

leftMap.setOptions('SATELLITE');
rightMap.setOptions('SATELLITE');

var linker = ui.Map.Linker([leftMap, rightMap]);

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  orientation: 'horizontal',
  wipe: true,
  style: {stretch: 'both'}
});

// Chart panels. 
var chartPanel = ui.Panel({
  style: {
    position: 'bottom-right',
    width: '360px',
    height: '180px',
    padding: '4px',
    backgroundColor: 'rgba(255,255,255,0.9)'
  }
});

rightMap.add(chartPanel);

// Control panel.
var title = ui.Label({
  value: 'Great Otway NDVI Split Panel App',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0px 0px 1px 0px'
  }
});

var author = ui.Label({
  value: 'Ethan Williams',
  style: {
    fontSize: '11px',
    fontWeight: 'bold',
    margin: '0 8px 0 8px'
  }
});

var studentNumber = ui.Label({
  value: 's3839065',
  style: {
    fontSize: '11px',
    color: 'gray',
    margin: '0 8px 8px 8px'
  }
});

var description = ui.Label({
  value: 'Select a locaility, satelitte and date from the panel below!',
  style: {
    fontSize: '12px',
    margin: '0 8px 8px 8px'
  }
});

var regionSelect = ui.Select({
  items: Object.keys(regions),
  value: 'Cape Otway',
  placeholder: 'Select region'
});

var sensorSelect = ui.Select({
  items: ['Sentinel-2', 'Landsat 8'],
  value: 'Sentinel-2',
  placeholder: 'Select sensor'
});

var leftDateBox = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2025-12-01'
});

var rightDateBox = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2026-02-01'
});

var updateButton = ui.Button({
  label: 'Update split panel',
  style: {stretch: 'horizontal'},
  onClick: updateMaps
});

var controlPanel = ui.Panel({
  widgets: [
    title,
    author,
    studentNumber,
    description,
    ui.Label('Locality'),
    regionSelect,
    ui.Label('Satellite sensor'),
    sensorSelect,
    ui.Label('Left panel date'),
    leftDateBox,
    ui.Label('Right panel date'),
    rightDateBox,
    updateButton,
    ui.Label('Valid date range: ' + appStart + ' to ' + appEnd)
  ],
  style: {
  width: '220px',
  padding: '6px',
  position: 'top-left'
}
});

// Update map function. 
function updateMaps() {
  var regionName = regionSelect.getValue();
  var sensor = sensorSelect.getValue();

  var leftDate = leftDateBox.getValue();
  var rightDate = rightDateBox.getValue();

  var region = regions[regionName];
  var aoi = region.geometry();

  var leftNdvi = getNDVI(sensor, aoi, leftDate);
  var rightNdvi = getNDVI(sensor, aoi, rightDate);

  leftMap.layers().reset();
  rightMap.layers().reset();

  leftMap.centerObject(aoi, 11);
  rightMap.centerObject(aoi, 11);

  // Add NDVI first so it is not hidden by the boundary.
  leftMap.addLayer(
    leftNdvi,
    ndviViz,
    sensor + ' NDVI - ' + leftDate
  );

  rightMap.addLayer(
    rightNdvi,
    ndviViz,
    sensor + ' NDVI - ' + rightDate
  );

  // Add boundary as outline only.
  var outline = ee.Image().byte().paint({
    featureCollection: region,
    color: 1,
    width: 3
  });

  leftMap.addLayer(
    outline,
    {palette: ['red']},
    regionName + ' boundary'
  );

  rightMap.addLayer(
    outline,
    {palette: ['red']},
    regionName + ' boundary'
  );

  chartPanel.clear();

chartPanel.add(
  ui.Label({
    value: regionName + ' | ' + sensor + ' | ' + leftDate + ' to ' + rightDate,
    style: {
      fontWeight: 'bold',
      fontSize: '10px',
      margin: '0 0 2px 0'
    }
  })
);

chartPanel.add(
  getDateRangeChart(sensor, aoi, regionName, leftDate, rightDate)
);
}

// Build GEE app. 
ui.root.clear();

ui.root.add(
  ui.Panel({
    widgets: [controlPanel, splitPanel],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'both'}
  })
);

updateMaps();
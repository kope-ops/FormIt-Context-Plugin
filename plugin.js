window.FormIt3DContextCreator = window.FormIt3DContextCreator || {};

// UI elements that will get updated when location changes
// or when a new sketch is opened
FormIt3DContextCreator.locationInput = undefined;
FormIt3DContextCreator.setOrUpdateLocationButton = undefined;
FormIt3DContextCreator.locationStatusContainer = undefined;
FormIt3DContextCreator.locationStatusIcon = undefined;
FormIt3DContextCreator.locationStatusText = undefined;
FormIt3DContextCreator.generateContextButton = undefined;

// the string attribute key to search for and delete previous context
FormIt3DContextCreator.generatedContextStringAttributeKey = 'FormIt3DContextCreator::GeneratedContext';

FormIt3DContextCreator.initializeUI = function()
{   
    // create an overall container for all objects that comprise the "content" of the plugin
    // everything except the footer
    const contentContainer = document.createElement('div');
    contentContainer.id = 'contentContainer';
    contentContainer.className = 'contentContainer'
    window.document.body.appendChild(contentContainer);

    // the header
    const header = document.createElement('h1');
    header.innerHTML = '3D Context Creator';
    contentContainer.appendChild(header);

    // the plugin header icon
    const pluginHeaderImage = document.createElement('img');
    pluginHeaderImage.className = 'pluginIcon center';
    pluginHeaderImage.src = './assets/images/u1.png';
    contentContainer.appendChild(pluginHeaderImage);

    // the current location
    const currentLocationSectionContainer = document.createElement('div');
    contentContainer.appendChild(currentLocationSectionContainer);
    const currentLocationInputModule = new FormIt.PluginUI.TextInputModuleV2('Current location:');
    FormIt3DContextCreator.locationInput = currentLocationInputModule.getInput();
    FormIt3DContextCreator.locationInput.disabled = true;
    contentContainer.appendChild(currentLocationInputModule.element);

    // the button/hyperlnk to set or update the location
    FormIt3DContextCreator.setOrUpdateLocationButton = document.createElement('a');
    FormIt3DContextCreator.setOrUpdateLocationButton.id = 'setOrUpdateHyperlink';
    FormIt3DContextCreator.setOrUpdateLocationButton.appendChild(document.createTextNode('Set or Update Location'));
    FormIt3DContextCreator.setOrUpdateLocationButton.setAttribute('href', 'javascript:void(0);');
    FormIt3DContextCreator.setOrUpdateLocationButton.onclick = async function() 
        {
            await FormIt3DContextCreator.launchSetLocation();
        }
    contentContainer.appendChild(FormIt3DContextCreator.setOrUpdateLocationButton);

    // status message and icon
    FormIt3DContextCreator.locationStatusContainer = new FormIt.PluginUI.MultiModuleContainer();
    FormIt3DContextCreator.locationStatusContainer.element.style.alignItems = 'center';
    contentContainer.appendChild(FormIt3DContextCreator.locationStatusContainer.element);
    // the status icon
    FormIt3DContextCreator.locationStatusIcon = document.createElement('img');
    FormIt3DContextCreator.locationStatusIcon.className = 'locationStatusIcon';
    FormIt3DContextCreator.locationStatusContainer.element.appendChild(FormIt3DContextCreator.locationStatusIcon);
    // the status message
    FormIt3DContextCreator.locationStatusText = document.createElement('div');
    FormIt3DContextCreator.locationStatusContainer.element.appendChild(FormIt3DContextCreator.locationStatusText);

    // the generate button 
    FormIt3DContextCreator.generateContextButton = new FormIt.PluginUI.Button('Generate 3D Context', create3DContext);
    FormIt3DContextCreator.generateContextButton.id = 'CreateButton';
    FormIt3DContextCreator.generateContextButton.element.style.marginTop = '40px';
    contentContainer.appendChild(FormIt3DContextCreator.generateContextButton.element);

    // create the footer    
    const footerModule = new FormIt.PluginUI.FooterModule;
    document.body.appendChild(footerModule.element);
}

FormIt3DContextCreator.updateUI = async function()
{
    // get the current location
    let currentLocation = await FormIt.SunAndLocation.GetProjectAddress();
    let bIsCurrentLocationSet = currentLocation != '';

    // set the location input to the current address
    FormIt3DContextCreator.locationInput.value = bIsCurrentLocationSet ? currentLocation : '(not set)';

    // update the set location button text based on whether a location is set
    FormIt3DContextCreator.setOrUpdateLocationButton.innerHTML = bIsCurrentLocationSet ? 'Update location...' : 'Set location...';

    // update the generate button style based on whether a location is set
    FormIt3DContextCreator.generateContextButton.element.disabled = bIsCurrentLocationSet ? false : true;

    // update the status icon based on whether a location is set
    FormIt3DContextCreator.locationStatusIcon.src = bIsCurrentLocationSet ? './assets/images/location-set.svg' : './assets/images/location-not-set.svg';
    FormIt3DContextCreator.locationStatusIcon.title = bIsCurrentLocationSet ? 'Location is set!' : 'Please set the location of this project first.';

    // update the status text based on whether a location is set
    FormIt3DContextCreator.locationStatusText.innerHTML = bIsCurrentLocationSet ? 'Location set!' : 'Set a location to continue.';

    // update the display of the status icon and text based on whether a location is set
    FormIt3DContextCreator.locationStatusContainer.element.style.display = bIsCurrentLocationSet ? 'none' : 'flex';
}

FormIt3DContextCreator.launchSetLocation = async function()
{
    await FormIt.Commands.DoCommand('Tools: Set Location');
}

FormIt3DContextCreator.getContextRadiusFromSatelliteImageSize = async function()
{
    // get all images in the sketch
    const allImages = await FormIt.ImageManager.GetAllImages(0, 0);

    // get the size of the image in either X or Y dimension (it's a square)
    let satelliteImageSizeX = 0;
    for (var i = 0; i < allImages.length; i++)
    {
        if (allImages[i].second.IsSatelliteImage)
        {
            satelliteImageSizeX = allImages[i].second.Size.x;
        }
    }
    
    // optional border factor so buildings are slightly beyond the sat image extents
    const borderFactor = 1.0;

    // this result is in feet, so convert to meters
    let satelliteImageSizeXInMeters = satelliteImageSizeX * 0.3048;

    let radiusWithFactor = (satelliteImageSizeXInMeters / 2) * borderFactor;

    return radiusWithFactor;
}

FormIt3DContextCreator.getGroupInstancesByStringAttributeKey = async function(nHistoryID, stringAttributeKey)
{
    // get all the instances in this history
    const potentialObjectsArray = await WSM.APIGetAllObjectsByTypeReadOnly(nHistoryID, WSM.nObjectType.nInstanceType);

    let aFinalObjects = [];

    if (potentialObjectsArray)
    {
        // for each of the objects in this history, look for ones with a particular string attribute key
        for (var i = 0; i < potentialObjectsArray.length; i++)
        {
            const instanceID = potentialObjectsArray[i];
            //console.log("Object ID: " + objectID);

            const objectHasStringAttributeResult = await WSM.Utils.GetStringAttributeForObject(nHistoryID, instanceID, stringAttributeKey);

            if (objectHasStringAttributeResult.success == true)
            {
                aFinalObjects.push(instanceID);
            }
        }
    }

    return aFinalObjects;
}

const constants = {
    apiTimeout: 25,
    notificationHandle: undefined
}

/**
 *  Get the numeric value of an input element. Defaults to 1.
 * @param {string} id - The id of the input element
 * @returns {number}
 */
const getInputNumberById = id => {
    const element = document.getElementById(id)
    const value = element !== null ? element.value : 0
    const number = Number(value)

    if(isNaN(number) || number === 0)
        throw `Failed to get input value of element #${id}`

    return number
}

/**
 *  Create 3D context
 */ 
const create3DContext = async () => {  
    try {            
        // Get location info from FormIt        
        let latLong = await getCoordinatesFromLocation();

        //constants.notificationHandle = displayGeneralMessage('Retrieved coordinates from location settings')

        // Disable 'Create' button until current operation is completed
        FormIt3DContextCreator.generateContextButton.element.disabled = true

        // Get the radius from the size of the satellite image
        const radius = await FormIt3DContextCreator.getContextRadiusFromSatelliteImageSize();

        // https://www.openstreetmap.org/#map=17/51.50111/-0.12531
        const locationGeoPoint = turf.point([ latLong.longitude, latLong.latitude ])

        const locationGeoBbox = getBbox(locationGeoPoint, radius)

        // Get the data from the OpenStreetMaps API
        const osmData = await getOSMData(locationGeoBbox)

        // Convert the OpenStreetMaps data to GeoJSON
        const geoJsonData = osmtogeojson(osmData)

        const geoFeatures = geoJsonData.features.filter(feature => feature.geometry.type === "Polygon" ) 

        // Create FormIt geometry
        createFormItGeometry(geoFeatures, locationGeoPoint)

        FormIt3DContextCreator.generateContextButton.element.disabled = false;
    }
    catch (e) {                        
        displayErrorMessage("An error has occured. " + e)
        console.error("An error has occured", e)
        FormIt3DContextCreator.generateContextButton.element.disabled = false;
    }
}

/**
 * Get the bounding box around the origin
 * @param {Object} locationGeoPoint - GeoJSON location point
 * @returns {Object} A turf.js bounding box
 */
const getBbox = (locationGeoPoint, radius) => {
    const circle = turf.circle(locationGeoPoint, radius * 0.001, { steps: 4 })
    return turf.bbox(circle)
}

/** 
 * OpenStreetMap® data was used to generate this plugin: https://www.openstreetmap.org/copyright
 * @param {Object} bbox - Bounding box
 * @returns {Object} The OSM response as an awaitable JSON object
 */
const getOSMData = async (bbox) => {
    const filters = [ "building" ]
    
    const endpoint = "https://overpass-api.de/api/interpreter"

    const bounds = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`

    let query = `?data=[out:json][timeout:${constants.apiTimeout}][bbox:${bounds}];`
    if (filters.length > 0) {
        query += "("

        filters.forEach(filter => {
            query += `way[${filter}];`
            query += `relation[${filter}];`
        })

        query += ");"
    }
    query += "(._;>;);"
    query += "out;"

    const url = endpoint + query
    displayGeneralMessage(`Sending API request. Depending on the info and satellite image area, this could take up to ${constants.apiTimeout} seconds`)
    
    const response = await fetch(url)
    if(response.ok)
        return response.json()
    throw `API request failed. ${response.status} ${response.statusText}`
}

/**
 * Create FormIt geometry
 * @param {Array} features - An array of GeoJSON features
 * @param {Object} center - GeoJSON location point
 * @returns {Array} FormIt extrusions
 */
const createFormItGeometry = async (features, center) => {

    // Like satellite and terrain, force the context geometry to the main history
    const contextPlacementHistoryID = 0;

    // first, delete any previously-generated context instances
    let existingContextInstances = await FormIt3DContextCreator.getGroupInstancesByStringAttributeKey(contextPlacementHistoryID, FormIt3DContextCreator.generatedContextStringAttributeKey);
    for (var i = 0; i < existingContextInstances.length; i++)
    {
        await WSM.APIDeleteObject(contextPlacementHistoryID, existingContextInstances[i]);
    }
    
    // Create group for the context group under current history ID
    const allContextGroupID = await WSM.APICreateGroup(contextPlacementHistoryID, []);

    // Instance ID
    const allPossibleInstances = await WSM.APIGetObjectsByTypeReadOnly(contextPlacementHistoryID, allContextGroupID, WSM.nObjectType.nInstanceType);
    const allContextInstanceID = allPossibleInstances[0];

    // apply the string attribute to the instance
    await WSM.Utils.SetOrCreateStringAttributeForObject(contextPlacementHistoryID,
        allContextInstanceID, FormIt3DContextCreator.generatedContextStringAttributeKey, "");

    // History ID for the context group
    const allContextGroupHistoryID= await WSM.APIGetGroupReferencedHistoryReadOnly(contextPlacementHistoryID, allContextGroupID);

    // Loop through each feature
    const geometryFormIt = Promise.all(features.map(async feature => {
        const storeyHeight = 12 //12 feet (average floor size)
        let height = storeyHeight

        if(feature.properties.building !== void 0)
            height = feature.properties.height

        if(feature.properties["building:levels"] !== void 0)
            height = feature.properties["building:levels"] * storeyHeight

        else 
            height = storeyHeight

        // Convert each GeoJSON polygon to an array of FormIt points
        const polygonsFormIt = feature.geometry.coordinates.map(async (polygon, index,points) => 
            {
                return Promise.all(polygon.map( vertex => 
                    {
                        const vertexFeet = CoordinateLocationToFeet(vertex,center.geometry.coordinates)
                    return WSM.Geom.Point3d(vertexFeet[0], vertexFeet[1], 0)
                        }))
            })             

        //start undo manager state - this should suspend WSM and other updates to make this faster
        FormIt.UndoManagement.BeginState() 

        //empty group in main group history
        const groupID = await WSM.APICreateGroup(allContextGroupHistoryID,[])             

        //history of the group, history to put buildings into
        const groupHistoryID = await WSM.APIGetGroupReferencedHistoryReadOnly(allContextGroupHistoryID , groupID) 

        //connect each of these points in the array into a polyline
        await Promise.all(polygonsFormIt.map(async (points, index) => {                
            try {
                const allPts = await points
                
                for(let i=0;i< allPts.length;i++)
                {
                    let k = (i + 1 +  allPts.length) %  allPts.length 

                    //sketch all out into group history
                    const pl = WSM.APIConnectPoint3ds(groupHistoryID, allPts[i],  allPts[k])  
                }                   
            }
            catch (e) {
                throw 'Failed to create extrusion'
            }
        }))

        //get all faces generated by polylines
        const faces = await WSM.APIGetAllObjectsByTypeReadOnly(groupHistoryID, WSM.nObjectType.nFaceType)      
                
        //drag or extrude only the first face generated by all polylines according to height
        await WSM.APIDragFace(groupHistoryID, faces[0], height)             

        //delete inner loop faces
        faces.forEach(async f => 
        {
            const index = faces.indexOf(f)               

            if(index !== 0)
            {
                await WSM.APIDeleteObject(groupHistoryID,faces[index])                    
            }
        })
        FormIt.UndoManagement.EndState("3D Context Creator plugin")
    }))
    displaySuccessMessage(`Created ${(await geometryFormIt).length} context features.`)
}

const CoordinateLocationToFeet = (point, origin)=>
{
    const pointX = turf.point([point[0], origin[1]])
    const pointY = turf.point([origin[0], point[1]])
    const options = {units: 'feet'};
    let distanceX = turf.distance(origin, pointX, options)
    let distanceY = turf.distance(origin, pointY, options)
    if (point[0]<origin[0]) distanceX = -distanceX
    if (point[1]<origin[1]) distanceY = -distanceY
    const coordinates = [distanceX,distanceY]
    return coordinates
}

/**
 *  Find coordinates from address set by users
 */
const getCoordinatesFromLocation = async()=>
{    
    //Get location info from FormIt    
    const location = await FormIt.SunAndLocation.GetLocationDateTime();
    const lat = location.latitude;
    const long = location.longitude; 
    
    return { "latitude" : lat, "longitude" : long };
}

/**
 *  Update bubble text on range slider
 */
const allRanges = document.querySelectorAll(".range-wrap")

allRanges.forEach(wrap =>
    {
        const range = wrap.querySelector(".range")
        const bubble = wrap.querySelector(".bubble")

        range.addEventListener("input", () =>
        {
            setBubble(range, bubble)
        })
            
        setBubble(range, bubble)
    })

function setBubble(range, bubble) 
{
    const val = range.value
    const min = range.min ? range.min : 0
    const max = range.max ? range.max : 100
    const newVal = Number(((val - min) * 100) / (max - min))
    bubble.innerHTML = val
        
    // Sorta magic numbers based on size of the native UI thumb
    bubble.style.left = `calc(${newVal}% + (${8 - newVal * 0.15}px))`
}

// Show messages with FormIt popUp
const displayGeneralMessage = async message =>
{        
    await FormIt.UI.CloseNotification(constants.notificationHandle)
    constants.notificationHandle = undefined
    constants.notificationHandle = await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Information, 0);
    return constants.notificationHandle;
}

const displayWarningMessage = async message =>
{        
    await FormIt.UI.CloseNotification(constants.notificationHandle)
    constants.notificationHandle = undefined
    constants.notificationHandle = await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Warning, 0);
    return constants.notificationHandle;
}

const displayErrorMessage = async message =>
{        
    await FormIt.UI.CloseNotification(constants.notificationHandle)
    constants.notificationHandle = undefined
    constants.notificationHandle = await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Error, 0);
    return constants.notificationHandle;
}

const displaySuccessMessage = async message =>
{   
    await FormIt.UI.CloseNotification(constants.notificationHandle)
    constants.notificationHandle = undefined
    constants.notificationHandle = await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Success, 0);
    return constants.notificationHandle;
}
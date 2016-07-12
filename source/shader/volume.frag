#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

vec3
get_gradient(vec3 in_sampling_pos)
{

	float step_x = 1.0 / volume_dimensions.x;
	float step_y = 1.0 / volume_dimensions.y;
	float step_z = 1.0 / volume_dimensions.z;

	// X axis
	float gx = (get_sample_data(vec3(in_sampling_pos.x + step_x, in_sampling_pos.y, in_sampling_pos.z)) - get_sample_data(vec3(in_sampling_pos.x - step_x, in_sampling_pos.y, in_sampling_pos.z))) / 2; // why divided by 2? and the h?
	// Y axis
	float gy = (get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y + step_y, in_sampling_pos.z)) - get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y - step_y, in_sampling_pos.z))) / 2;
	// Z axis
	float gz = (get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y, in_sampling_pos.z + step_z)) - get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y, in_sampling_pos.z - step_z))) / 2;

	vec3 gradient = vec3(gx, gy, gz);
	//float magnitude = sqrt(gx*gx + gy*gy + gz*gz);

	return gradient;
}


float
shadow_calculation(vec3 in_sampling_pos)
{
	float shadow = 0.0;
	vec3 vec_increment = normalize(in_sampling_pos - light_position) * sampling_distance;

	vec3 frag_pos = in_sampling_pos + vec_increment;

	/// check if we are inside volume
	bool inside_volume = inside_volume_bounds(frag_pos);

	while (inside_volume)
	{
		// get sample
		float s = get_sample_data(frag_pos);
	 
		if (s > iso_value) {
			shadow = 1.0;
			break;
		}

		frag_pos += vec_increment;

		// update the loop termination condition
		inside_volume = inside_volume_bounds(frag_pos);

	}
    return shadow;
}

float
opacity_correction(float old_opacity)
{
	float relative_sampling_rate = sampling_distance / sampling_distance_ref;
	return (1 - pow((1 - old_opacity), relative_sampling_rate * 255));
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

	// Normal vector
	vec3 N = vec3(0.0);

	// Phong shading variables
	const float ka = 0.25;
	const float kd = 0.5;
	const float ks = 0.5;
	float shininess = light_ref_coef;

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif
    
#if TASK == 11
	int i = 0;
    vec4 avg_val = vec4(0.0, 0.0, 0.0, 0.0);

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        // average intensity projection
        avg_val.r = avg_val.r + color.r;
        avg_val.g = avg_val.g + color.g;
        avg_val.b = avg_val.b + color.b;
        avg_val.a = avg_val.a + color.a; // not ideal, individual characteristics are lost
		i = i + 1;
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }
	
    avg_val.r = avg_val.r/i;
    avg_val.g = avg_val.g/i;
    avg_val.b = avg_val.b/i;
    avg_val.a = avg_val.a/i;

	dst = avg_val;
#endif
    
#if TASK == 12 || TASK == 13

	float prev_s = 0.0;
	int iterations = 400;
	int i = 0;
	float sigma = 0.00000001;
	vec3 left = vec3(0.0);
	vec3 right = vec3(0.0);
	float s_mid = 0.0;
	bool found = false;
	vec4 showing_color = vec4(0.0, 0.0, 0.0, 1.0);
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
		float s = get_sample_data(sampling_pos);

		// apply the transfer functions to retrieve color and opacity
		vec4 color = texture(transfer_texture, vec2(s, s));

		vec3 mid = sampling_pos;

		// First hit
		if ((s > iso_value)) {
			showing_color = color;
			//N = normalize(get_gradient((mid).xyz)); // to show normals
		

#if TASK == 13 
			// Binary Search
			left = sampling_pos - ray_increment;
			right = sampling_pos;
			s_mid = s;

			i = 0;
			found = false;

			while (i < iterations && !found) {
				
				mid = (right + left)/2;
				s_mid = get_sample_data(mid);

				if (abs(s_mid - iso_value) < sigma) {
					found = true;
					break;
				} else {
					if (s_mid > iso_value) {
						right = mid;
					}
					else {
						left = mid;
					}
				}
				i = i + 1;
			}
			showing_color = texture(transfer_texture, vec2(s_mid, s_mid));
			//N = normalize(get_gradient((mid).xyz)); // to show normals

#endif
			//showing_color = vec4(N / 2 + 0.5, 1.0);
			
#if ENABLE_LIGHTNING == 1 // Add Shading

		//normalize vectors after interpolation
		vec3 N = normalize(get_gradient((mid).xyz)); // surface normal
		vec3 L = normalize((light_position - mid).xyz);
		vec3 V = normalize((-ray_increment).xyz);

		vec3 halfWayDir = normalize(light_position.xyz + camera_location.xyz);

		float spec = ks * pow(max(0.0, dot(N, halfWayDir)), shininess);

		float diffuse = kd * max(dot(N, L), 0.0);
		diffuse = clamp(diffuse, 0.0, 1.0);

		vec3 ambient_v = ka * light_ambient_color;
		vec3 diffuse_v = diffuse * light_diffuse_color;
		vec3 specular_v = spec * light_specular_color;

		showing_color = vec4((ambient_v + diffuse_v + specular_v) + showing_color.xyz, 1.0); 

		// Code taken from: http://learnopengl.com/#!Advanced-Lighting/Advanced-Lighting
		// http://sunandblackcat.com/tipFullView.php?l=eng&topicid=30&topic=Phong-Lighting
   

#if ENABLE_SHADOWING == 1 // Add Shadows
		float shadow = shadow_calculation(mid);

		showing_color = vec4((ambient_v + (1.0 - shadow) * (diffuse_v + specular_v)) + showing_color.xyz, 1.0);
		// showing_color = vec4((ka + (1.0 - shadow) * (diffuse + spec)) * showing_color.xyz, 1.0);
 
#endif
#endif
		break;
		}
		prev_s = s;

		// increment the ray sampling position
		sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
		
	dst = showing_color;
#endif 
	
// http://http.developer.nvidia.com/GPUGems/gpugems_ch39.html
#if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
	sampling_pos       = ray_entry_position + ray_increment;

	float trans = 1.0;
	vec4 prev_color = vec4(0.0);
	vec3 accumulated_color = vec3(0.0);

	vec4 showing_color = vec4(0.0);

	// back-to-front variables
	vec3 inten = vec3(0.0);
	vec4 back_color;

    while (inside_volume)
    {
        // get sample
		float s = get_sample_data(sampling_pos);
		vec4 color = texture(transfer_texture, vec2(s, s));

#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
		color.a = opacity_correction(color.a);
#else 
        // nothing
#endif
		//trans = trans * (1 - prev_color.a);
		//accumulated_color = accumulated_color + trans * color.rgb * color.a;

#if ENABLE_LIGHTNING == 1 // Add Shading
		vec3 N = normalize(get_gradient((sampling_pos).xyz)); // surface normal
		vec3 L = normalize((light_position - sampling_pos).xyz);
		vec3 V = normalize((-ray_increment).xyz);
		vec3 halfWayDir = normalize(light_position.xyz + camera_location.xyz);

		float spec = ks * pow(max(0.0, dot(N, halfWayDir)), shininess);
		float diffuse = kd * max(dot(N, L), 0.0);
		diffuse = clamp(diffuse, 0.0, 1.0);

		vec3 ambient_v = ka * light_ambient_color;
		vec3 diffuse_v = diffuse * color.rgb;
		vec3 specular_v = spec * light_specular_color;

		//accumulated_color = vec4((ambient_v + diffuse_v + specular_v) + accumulated_color.xyz, accumulated_color.a); // trans?
		//accumulated_color = ( diffuse_v /* + specular_v*/) * 0.5 + accumulated_color; // trans?

		color = vec4((diffuse_v + ambient_v + specular_v) + color.rgb, color.a); // trans?
		//color = vec4(vec3(1.1, 0.1, 0.1) + color.rgb, color.a); // trans?

		//showing_color = vec4(accumulated_color, 1.0);
#endif
		/*
		// *********************************************************************
		// 3.1 Front-to-back compositing traversal scheme
		trans = trans * (1 - prev_color.a);
		accumulated_color = accumulated_color + trans * color.rgb * color.a;

		showing_color = vec4(accumulated_color, trans);

		// early ray termination
		if (trans <= 0.01) {
			break;
		}

		prev_color = color;
		// *********************************************************************
		*/

		// increment the ray sampling position
		sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);

		// for back-to-front composting
		back_color = color;

    }

	
	// *********************************************************************
	// 3.2 Back-to-front compositing traversal scheme
	sampling_pos -= ray_increment;
	inside_volume = inside_volume_bounds(sampling_pos);

	while (inside_volume)
	{
		//T[i-1] = prev_color.a;
		//inten = accumulated_color
		//I[i] = color.rgb * color.a
		//C[i] = color.rgb
		//A[i] = color.a

		inten = back_color.rgb * back_color.a  + inten * (1 - back_color.a);
		showing_color = vec4(inten, 1.0);

		// increment the ray sampling position
		sampling_pos -= ray_increment;

		// get sample
		float s = get_sample_data(sampling_pos);
		back_color = texture(transfer_texture, vec2(s, s));

		// update the loop termination condition
		inside_volume = inside_volume_bounds(sampling_pos);

	}
	// *********************************************************************
	

	// total intensity accumulated on the ray
	dst = showing_color;
#endif 

    // return the calculated color value
	FragColor = dst;
}

